'use strict';

/**
 * Maps HomeKit RotationSpeed (0–100%) <-> device steps (0–7) + Turbo (8)
 * - When setting:
 *    % -> step = round(% / 12.5)
 *    step 8 => publish control/mode=4 (Turbo), suppress speed
 *    step 0–7 => publish control/mode=1 and control/speed=<0..7>
 * - When reading:
 *    if mode==4 => report 100%
 *    else => report round(step/8*100)%
 * - CurrentAirPurifierState:
 *    0 INACTIVE when mode==0
 *    1 IDLE     when mode in [1..5] and speed==0
 *    2 PURIFYING otherwise
 */

module.exports = {
  init: function (params) {
    const { config, publish, notify, log } = params;
    const topics = (config && config.topics) || {};

    const tModeSet  = topics.setActive;        // control/mode
    const tModeGet  = topics.getActive;        // state/mode
    const tSpeedSet = topics.setRotationSpeed; // control/speed
    const tSpeedGet = topics.getRotationSpeed; // state/speed

    let lastMode;   // number
    let lastSpeed;  // 0..7

    // Reconcile timer to fix slider if Turbo didn't actually engage
    let turboReconcileTimer = null;
    const RECONCILE_MS = Number(config && config.turboReconcileMs) || 1000;

    function startTurboReconcileTimer() {
      if (turboReconcileTimer) clearTimeout(turboReconcileTimer);
      turboReconcileTimer = setTimeout(() => {
        turboReconcileTimer = null;
        // If we never entered mode 4, push actual current speed % back to HomeKit
        if (lastMode !== 4) {
          const pct = computeReportedPct();
          if (pct !== undefined) {
            log && log(`[Rusclimate] Turbo not engaged; correcting slider to ${pct}%`);
            notify('rotationSpeed', pct);
          }
        }
      }, RECONCILE_MS);
    }

    function cancelTurboReconcileIfEngaged() {
      if (lastMode === 4 && turboReconcileTimer) {
        clearTimeout(turboReconcileTimer);
        turboReconcileTimer = null;
      }
    }

    function clamp(n, lo, hi) {
      n = Number(n);
      if (isNaN(n)) return undefined;
      return Math.max(lo, Math.min(hi, n));
    }

    const pctToStep = (pct) => {
      const p = clamp(pct, 0, 100);
      if (p === undefined) return undefined;
      return Math.round(p / 12.5); // 0..8
    };

    const stepToPct = (step) => {
      const s = clamp(step, 0, 8);
      if (s === undefined) return undefined;
      return s === 8 ? 100 : Math.round((s / 8) * 100);
    };

    function computeCurrentState() {
      if (lastMode === undefined) return undefined;
      if (lastMode === 0) return 0; // INACTIVE
      if (lastMode >= 1 && lastMode <= 5) {
        if (lastSpeed === undefined) return undefined;
        return lastSpeed === 0 ? 1 : 2; // IDLE or PURIFYING
      }
      return 2; // any other mode -> PURIFYING
    }

    function computeReportedPct() {
      if (lastMode === 4) return 100; // Turbo
      if (lastSpeed === undefined) return undefined;
      return stepToPct(lastSpeed);
    }

    function pushDerived() {
      const cs = computeCurrentState();
      if (cs !== undefined) notify('currentAirPurifierState', cs);

      const pct = computeReportedPct();
      if (pct !== undefined) notify('rotationSpeed', pct);
    }

    log && log('[Rusclimate] codec initialized');

    return {
      properties: {
        // ---------- ENCODE (publishing) ----------
        active: {
          encode: function (msg /* boolean */) {
            return msg ? '1' : '0'; // mode 1 = on, 0 = off
          }
        },

        rotationSpeed: {
          encode: function (msg /* percent 0..100 */, info, output) {
            const step = pctToStep(msg);
            if (step === undefined) return;

            log && log(`[Rusclimate] set rotationSpeed ${msg}% -> step ${step}`);

            if (step === 8) {
              if (tModeSet) publish(tModeSet, '4'); // Turbo
              startTurboReconcileTimer(); // >>> added
              return; // suppress original % publish to speed topic
            } else {
              if (tModeSet)  publish(tModeSet, '1');           // ensure running
              if (tSpeedSet) publish(tSpeedSet, String(step)); // 0..7
              return; // suppress original % publish
            }
          }
        },

        // ---------- DECODE (receiving) ----------
        active: {
          // read from state/mode
          decode: function (message) {
            const m = Number(message);
            if (!isNaN(m)) lastMode = m;
            cancelTurboReconcileIfEngaged();
            pushDerived();
            return m !== 0;
          }
        },

        rotationSpeed: {
          // read from state/speed
          decode: function (message, info) {
            const s = clamp(message, 0, 7);
            if (s !== undefined) lastSpeed = s;
            // no need to cancel timer here; mode decides Turbo state
            const pct = computeReportedPct();
            pushDerived();
            return pct;
          }
        },

        currentAirPurifierState: {
          // also subscribe to state/mode to recompute
          decode: function (message) {
            const m = Number(message);
            if (!isNaN(m)) lastMode = m;
            cancelTurboReconcileIfEngaged();
            const cs = computeCurrentState();
            pushDerived();
            return cs;
          }
        }
      },

      // Safety net: catch-all encode in case property mapping ever misses
      encode: function (msg, info) {
        if (info && info.property === 'rotationSpeed') {
          const step = pctToStep(msg);
          if (step === undefined) return;
          log && log(`[Rusclimate] (fallback) set rotationSpeed ${msg}% -> step ${step}`);
          if (step === 8) {
            if (tModeSet) publish(tModeSet, '4');
            startTurboReconcileTimer();
          } else {
            if (tModeSet)  publish(tModeSet, '1');
            if (tSpeedSet) publish(tSpeedSet, String(step));
          }
          return; // suppress original
        }
        return msg; // passthrough others
      }
    };
  }
};
