# Deploy en la Raspberry

Una sola instancia, en la Raspberry (`192.168.100.12`), publicada en
**https://super.turtinga.fyi**.

## Cómo funciona

1. Cada merge a `master` dispara GitHub Actions: corre los tests, arma la imagen
   para ARM64, la prueba, y la publica en `ghcr.io/emanuelturtula/shopping-list`.
2. En la Raspberry, un timer de systemd corre `update.sh` cada minuto: si hay una
   imagen nueva, la baja y reinicia la app. O sea, el deploy llega solo en uno o dos minutos.
3. Un contenedor `cloudflared` abre un **Cloudflare Tunnel** saliente hacia Cloudflare.
   No hace falta abrir puertos en el router y la IP de casa no queda expuesta.
4. **Cloudflare Access** pide el mail antes de dejar pasar a nadie, y le dice a la
   app quién es cada uno.

¿Por qué no un runner de GitHub en la Raspberry? El repo es público, y un runner
propio en un repo público deja que cualquiera que abra un PR corra código en tu
red. Con este esquema la Raspberry solo descarga; nadie de afuera puede ejecutar nada en ella.

## Configuración (una sola vez)

### 1. Crear el túnel en Cloudflare

1. En el dashboard de Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel**.
2. Tipo **Cloudflared**, nombre `shopping-list`.
3. En "Install and run a connector" elegí Docker y copiá el **token** (lo que viene
   después de `--token`). Lo vas a pegar en el paso 3.
4. En **Public hostnames** agregá:
   - Subdomain `super`, Domain `turtinga.fyi`
   - Service: **HTTP**, URL: `app:8080`

### 2. Proteger con Cloudflare Access

1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Application domain: `super.turtinga.fyi`.
3. Policy: Action **Allow**, Include → **Emails** → los mails de la familia.
4. Login method: **One-time PIN** (llega un código por mail; no hace falta contraseña).

Para sumar a alguien más adelante, agregá su mail a esa policy.

### 3. Instalar en la Raspberry

```sh
git clone https://github.com/emanuelturtula/shopping-list.git
cd shopping-list
sudo sh deploy/install.sh     # instala Docker si falta y pide el token del túnel
```

Queda todo en `/opt/shopping-list`:

- `.env`: el token del túnel (no se sube a GitHub)
- `data/`: la base SQLite y las fotos. **Esto es lo que hay que respaldar.**

### 4. Primera vez: que la imagen sea pública

Después del primer merge a `master`, GitHub publica la imagen como privada. Si
`update.sh` falla con `denied`, entrá a
https://github.com/emanuelturtula?tab=packages → `shopping-list` →
Package settings → Change visibility → **Public**. (La imagen no tiene datos tuyos, solo el código.)

## Día a día

```sh
journalctl -u shopping-list-update -f       # ver los deploys
cd /opt/shopping-list && docker compose logs -f app
curl http://127.0.0.1:8080/api/health
```

Volver a una versión anterior: en `/opt/shopping-list/docker-compose.yml` cambiá
`:latest` por `:<sha del commit>` y corré `docker compose up -d`. Mientras quede así,
el timer no la va a actualizar.
