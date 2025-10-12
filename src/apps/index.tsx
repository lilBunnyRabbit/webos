/*
Ideas: 
- lazy loading
- react-router memory router for each window
- app configs: only one window, more windows, etc
- app render props
*/

import * as Apps from "./apps";

export default Apps;

export type AppsConfig = typeof Apps;

export type AppId = keyof typeof Apps;
