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
4. **Cloudflare Access** pide entrar con Google antes de dejar pasar a nadie, deja pasar
   solo a los mails de la lista, y le dice a la app quién es cada uno. La sesión dura un mes por navegador.

¿Por qué no un runner de GitHub en la Raspberry? El repo es público, y un runner
propio en un repo público deja que cualquiera que abra un PR corra código en tu
red. Con este esquema la Raspberry solo descarga; nadie de afuera puede ejecutar nada en ella.

## Configuración (una sola vez)

> Cloudflare cambia seguido los nombres de los menús. Si algo no aparece exactamente
> así, buscá el nombre parecido en el mismo lugar.

### 0. Activar Zero Trust (solo la primera vez)

1. Entrá a https://one.dash.cloudflare.com y elegí tu cuenta.
2. Si es la primera vez, te pide un **team name** (por ejemplo `turtinga`). Anotalo:
   tu dominio de equipo va a ser `turtinga.cloudflareaccess.com`.
3. Elegí el plan **Free** (gratis hasta 50 usuarios). Puede que pida una tarjeta igual; no cobra.

### 1. Login con Google

**En Google Cloud** (https://console.cloud.google.com):

1. Arriba, **Select a project → New project**, nombre `super-turtinga`, Create.
2. Menú → **APIs & Services → OAuth consent screen** (o "Google Auth Platform").
   - Tipo **External**, nombre de la app `Lista del súper`, tu mail como soporte y contacto.
   - En **Audience**, tocá **Publish app**. Así puede entrar cualquier cuenta de Google
     (igual Cloudflare solo deja pasar a los mails que pongas en el paso 3). Solo pide
     mail y nombre, así que Google no exige verificación.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorized JavaScript origins: `https://TU-TEAM.cloudflareaccess.com`
   - Authorized redirect URIs: `https://TU-TEAM.cloudflareaccess.com/cdn-cgi/access/callback`
   - Create, y copiá el **Client ID** y el **Client secret**.

**En Cloudflare Zero Trust:**

4. **Settings → Authentication → Login methods → Add new → Google**.
5. Pegá el Client ID y el Client secret, Save, y tocá **Test**: tiene que abrir el login
   de Google y mostrar "Your connection works!".

### 2. Crear el túnel

1. **Networks → Tunnels → Create a tunnel → Cloudflared**, nombre `shopping-list`.
2. En la pantalla de instalación elegí **Docker** y copiá el **token** (el texto largo
   después de `--token`). No ejecutes el comando: el token lo pega `install.sh` en el paso 4.
3. Next. En **Public hostname** (o "Published application routes") completá:
   - Subdomain `super`, Domain `turtinga.fyi`
   - Service type **HTTP**, URL `app:8080`
4. Save. Cloudflare crea solo el registro DNS de `super.turtinga.fyi`.

### 3. Proteger con Cloudflare Access

1. **Access → Applications → Add an application → Self-hosted**.
2. Nombre `Lista del súper`, **Session duration: 1 month**.
3. Agregá el hostname: subdomain `super`, domain `turtinga.fyi`.
4. En **Login methods / Identity providers**, dejá tildado solo **Google** y activá
   **Instant Auth**, así va directo al login de Google.
5. **Add a policy**: nombre `Familia`, Action **Allow**, Include → **Emails** →
   los mails de Google de cada uno.
6. Save.

Para sumar a alguien más adelante, agregá su mail a esa policy.

### 4. Instalar en la Raspberry

```sh
git clone https://github.com/emanuelturtula/shopping-list.git
cd shopping-list
sudo sh deploy/install.sh     # instala Docker si falta y pide el token del túnel
```

Queda todo en `/opt/shopping-list`:

- `.env`: el token del túnel (no se sube a GitHub)
- `data/`: la base SQLite y las fotos. **Esto es lo que hay que respaldar.**

### 5. Si la imagen no se puede bajar

Hoy la imagen es pública, así que no debería pasar. Si alguna vez
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
