export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
}

/**
 * Four boards, each one a real surface rather than a shade of grey.
 * The page is a dark room; the board is the lit object on the table.
 */
export const BOARD_THEMES: BoardTheme[] = [
  { id: "jade",   name: "Jade",   light: "#D3DAC9", dark: "#5E7A63" },
  { id: "walnut", name: "Walnut", light: "#E9D5B3", dark: "#9A6A43" },
  { id: "slate",  name: "Slate",  light: "#CBD1DD", dark: "#58627A" },
  { id: "ash",    name: "Ash",    light: "#B4B4BC", dark: "#4A4A55" },
];

export const DEFAULT_THEME = BOARD_THEMES[0];
export const THEME_STORAGE_KEY = "glyph.boardTheme";

export function applyBoardTheme(theme: BoardTheme) {
  const root = document.documentElement;
  root.style.setProperty("--sq-light", theme.light);
  root.style.setProperty("--sq-dark", theme.dark);
}
