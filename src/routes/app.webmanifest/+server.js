import { json } from '@sveltejs/kit';
import { base } from '$app/paths';

export const prerender = true;

export function GET() {
  const manifest = {
    "short_name": "Petristation",
    "name": "Petristation",
    "description": "Edit and simulate petri nets collaboratively in your web browser.",
    "icons": [
      {
        "src": `${base}/appicon.png`,
        "sizes": "256x256",
        "type": "image/png"
      },
      {
        "src": `${base}/favicon.svg`,
        "sizes": "152x152",
        "type": "image/svg+xml"
      }
    ],
    "start_url": ".",
    "scope": "/",
    "display": "standalone",
    "theme_color": "#222222",
    "background_color": "#23875d",
    "shortcuts": [
      {
        "name": "Documents",
        "url": `${base}/documents`
      },
      {
        "name": "Simulations",
        "url": `${base}/simulations`
      }
    ]
  }
;

  return json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json'
    }
  });
}