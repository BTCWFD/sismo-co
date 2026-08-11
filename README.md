# Sismo CO

PWA de monitoreo sísmico. Muestra el catálogo revisado del **USGS** y un flujo en vivo
del **EMSC** por WebSocket, en dos paneles separados.

> **Esto no es un sistema de alerta temprana.** Todo lo que muestra la app se publica
> *después* de que el sismo ocurrió. Los sismos no se pueden predecir.
> Emergencias en Colombia: **123** y los canales de la
> [UNGRD](https://portal.gestiondelriesgo.gov.co/).

## Fuentes

| Fuente | Uso | Endpoint |
|---|---|---|
| USGS (fdsnws) | catálogo bajo demanda, magnitudes revisadas | `https://earthquake.usgs.gov/fdsnws/event/1/query` |
| EMSC (seismicportal) | detección rápida, magnitud preliminar | `wss://www.seismicportal.eu/standing_order/websocket` |

Los dos flujos **no se mezclan a propósito**: las magnitudes de redes distintas no son la
misma medida y unirlas genera duplicados que falsean el conteo de réplicas. El panel del
EMSC va marcado como *preliminar*.

Enlaces al SGC, GEOFON y al Global Volcanism Program del Smithsonian están en la app.

## Estructura

```
index.html              armazón de la interfaz
src/app.js              fetch USGS + WebSocket EMSC + registro del service worker
src/styles.css          estilos
manifest.webmanifest    metadatos PWA
sw.js                   service worker (cachea el armazón, nunca los datos)
icons/                  iconos 192 / 512 / maskable
```

## Correr en local

Un servidor estático basta; abrir `index.html` con `file://` no sirve porque el service
worker exige HTTPS o `localhost`.

```bash
npx serve . -l 5173
```

Luego <http://localhost:5173>.

## Despliegue

GitHub Pages sobre la rama `main`, carpeta raíz. El HTTPS que da Pages es lo que permite
instalar la PWA en Android desde Chrome (menú → *Instalar aplicación*).

## Android (Capacitor)

`appId`: `co.sismo.monitor`. El proyecto nativo **no se versiona** (`android/` está en
`.gitignore`); se recrea desde cero:

```bash
npm install
npx cap add android
npm run sync
```

`npm run sync` genera `www/` y luego corre `npx cap sync android`. Capacitor **no acepta**
`webDir: "."` — lo rechaza explícitamente — y aunque lo aceptara empaquetaría
`node_modules/`, `android/` y `.git/` dentro del APK. Por eso `scripts/build-www.mjs` copia
solo los assets del sitio a `www/`, que es un artefacto de build y tampoco se versiona.
Las fuentes se quedan en la raíz para que GitHub Pages sirva el repo tal cual.

Único permiso: `android.permission.INTERNET`. La app no usa ubicación, contactos ni
almacenamiento; no agregues permisos que no necesite.

### JDK: Capacitor 8 necesita **21**, no 17

Compilar con JDK 17 falla en `:capacitor-android:compileDebugJavaWithJavac` con
`error: invalid source release: 21`. No hace falta instalar nada: Android Studio trae un
JBR 21 embebido, y Studio lo usa por defecto. Para compilar por consola hay que apuntarlo:

```bash
JAVA_HOME="C:\Program Files\Android\Android Studio\jbr" ./gradlew app:assembleDebug
```

APK de depuración: `android/app/build/outputs/apk/debug/app-debug.apk`.
Desde Android Studio: `npx cap open android` → *Build → Build Bundle(s) / APK(s) → Build APK(s)*.

### Permisos del manifiesto fusionado

```
android.permission.INTERNET
co.sismo.monitor.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
```

El segundo lo inyecta AndroidX Core: es un permiso de firma que la propia app se define a
sí misma para registrar broadcast receivers no exportados en API 33+. No pide nada al
usuario ni da acceso a ningún dato del dispositivo, y no se puede quitar sin romper
AndroidX. Ningún permiso de ubicación, contactos ni almacenamiento.

## Privacidad

No hay analítica, ni cookies, ni backend propio. Las peticiones van directo al USGS y al
EMSC desde el navegador.

## Notas de diseño

- El service worker **nunca** cachea respuestas de otro origen: un sismo viejo servido de
  caché durante una emergencia es peor que un error visible.
- El WebSocket se cierra cuando la pestaña se oculta y reconecta con backoff exponencial
  al volver, para no gastar batería en móvil.
- Los datos remotos se insertan con `textContent`, nunca con `innerHTML`.
