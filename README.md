# <img src="./static/favicon.svg" align="bottom" width="32" height="32" alt="Renew Icon" /> Renew Editor

[Renew](http://renew.de) Web Editor Frontend (WIP)

Currently this is only a mock implementation. It is not yet connected to any backend and does not implement any interesting features. It is only a sketch of the general flow of interaction.

The goal is to connect this frontend via REST/Websocket API to the Renew Web Editor backend and implement a SVG renderer with smooth touch interactions.

Most of the work is actually already done at [lazlokorte/svatom](https://github.com/laszlokorte/svatom) but needs to be clean up and ported over.

## Development

### Install dependencies

```sh
yarn install
```

### Start Mock Auth API

```sh
 php -S 127.0.0.1:9999 dev/mockapi.php
```

### Start Frontend Dev Webserver

```sh
yarn dev --open
```

---

[www.laszlokorte.de](//www.laszlokorte.de)