# Ballu-ASP-100-Homebridge
Adding support for the Ballu Oneair ASP-100 (Electrolux EASP-100) breather in Homebridge.

<img height="600" alt="Image" src="https://github.com/user-attachments/assets/0c365a95-f051-4560-a2e9-c8bd3b46729a" />
<img height="600" alt="Image" src="https://github.com/user-attachments/assets/f57bd71a-87d1-46e3-919d-15f6f17b841d" />


## Что это
Это способ добавить бризер Баллу ASP-100 в приложение Дом на устройствах Эпл.

Конфиг имеет 9 уровней скорости:
- На 0 скорости бризер выключает вентилятор, но оставляет заглушку открытой.
- На скорости 1-7 меняется скорость вентилятора.
- На максимальной скорости включается турбо режим на 15 минут, после возвращается на исходную скорость.

Если бризер выключить, он закрывает заглушку.


## Подключение
1. Подключить бризер к вайфаю через стандартное приложение.

2. Установить Homebridge и брокер EMQX. Например, с помощью docker-compose:
```
services:
  homebridge:
    image: homebridge/homebridge:latest
    container_name: homebridge
    network_mode: host
    environment:
      - TZ=Europe/London
      - HOMEBRIDGE_INSECURE=1
    volumes:
      - ./homebridge:/homebridge
    restart: unless-stopped

  emqx:
    image: emqx/emqx:latest
    container_name: emqx
    network_mode: host
    restart: unless-stopped
    environment:
      - EMQX_LISTENERS__TCP__DEFAULT__BIND=0.0.0.0:1883
      - EMQX_LISTENERS__SSL__DEFAULT__BIND=0.0.0.0:8883
      - EMQX_DASHBOARD__LISTENERS__HTTP__BIND=0.0.0.0:18083
    volumes:
      - ./emqx/certs:/emqx/certs:ro
```

3. В EMQX включить авторизацию по логину-паролю:

   `Access Control → Authentication → Create`: Password-Based, Built-in Database, остальное по-умолчанию.

   `В созданой базе → Users → Add`: rusclimate / 87fcf5e2e441. Логин и пароль одинаковые для всех устройств.


4. На роутере настроить DNS запись `mqtt.cloud.rusklimat.ru` c IP вашего EMQX. Отключить питание бризера на несколько секунд для сброса кеша DNS.

5. Когда бризер подключится к EMQX, он отобразится на странице `Monitoring → Clients`. Сохранить Client ID.

6. В Homebridge установить плагин `Homebridge Mqttthing`. Не настраивайте плагин через интерфейс, он не поддерживает все функции.

7. На странице `JSON Config` добавить два устройства из конфига в массив `accessories`. Устройство с типом `"airPurifier"` — это бризер. Устройство `"temperatureSensor"` — встроенный датчик температуры. Заменить `<YOUR_BREATHER_ID>` на `Client ID` из 5 шага.

8. Положить кодек `ballu-asp-100.js` в папку, где развёрнут Homebridge. Если используете докер — это папка `./homebridge`.

9. Перезагрузить Homebridge и отсканировать куаркод на главной странице через приложение Дом, чтобы добавить хаб в Apple Home.


_Проверено на версии Homebridge 1.11.0, EMQX 5.10.0 и прошивке 1.35._

_Основано на [репозитории v-vadim для Home Assistant](https://github.com/v-vadim/Ballu_ASP-100/tree/main)._ 
