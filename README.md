# Lista del súper

App para armar listas de compras, anotar precios y promociones en el súper, y ver
cuánto va a salir la compra y cómo varían los precios con el tiempo.

## Cómo está armada

- `server/`: API en Node.js (Express) con SQLite (`better-sqlite3`). Sirve también el frontend ya compilado y las fotos.
- `web/`: frontend en React + Vite, pensado para usar desde el celular.
- Todo corre en un solo contenedor Docker en el puerto **8080**. Los datos (base y fotos) quedan en `./data` en el host.

## Usuarios

No hay login propio. La app está detrás de **Cloudflare Access**, que pide un código por
mail y le pasa a la app el mail de quien entró (header `Cf-Access-Authenticated-User-Email`).
La primera vez que alguien entra se le crea el usuario. Todos los usuarios comparten los
mismos productos, listas y precios.

### Seguridad

La app confía en ese header, así que **no tiene que ser accesible por otro camino que no sea
el Cloudflare Tunnel**. Por eso `docker-compose.yml` publica el puerto solo en `127.0.0.1`.

## Desarrollo local

```sh
cd server && npm install && DEV_USER_EMAIL=yo@ejemplo.com npm run dev
cd web && npm install && npm run dev   # http://localhost:5173
```

Tests: `cd server && npm test`.

## Producción (Raspberry)

```sh
docker compose up -d --build
```
