/** Free browser games that open in a new tab. No accounts, no installs. */
export interface WebGame {
  name: string;
  url: string;
  blurb: string;
  emoji: string;
}

export const WEB_GAMES: readonly WebGame[] = [
  { name: 'Google Snake', url: 'https://www.google.com/fbx?fbx=snake_arcade', blurb: 'Eat apples, avoid your own tail.', emoji: '🐍' },
  { name: 'Google Pac-Man', url: 'https://www.google.com/logos/2010/pacman10-i.html', blurb: 'The 1980 original, playable in a tab.', emoji: '👾' },
  { name: '2048', url: 'https://play2048.co', blurb: 'Slide tiles, merge numbers, reach 2048.', emoji: '🔢' },
  { name: 'Quick, Draw!', url: 'https://quickdraw.withgoogle.com', blurb: 'Doodle in 20 seconds while an AI guesses.', emoji: '✏️' },
  { name: 'Flappy Bird', url: 'https://flappybird.io', blurb: 'Tap to fly. Harder than it looks.', emoji: '🐤' },
  { name: 'Minesweeper', url: 'https://minesweeper.online', blurb: 'Clear the board without hitting a mine.', emoji: '💣' },
];

export function randomWebGame(exclude?: string): WebGame {
  const pool = WEB_GAMES.filter((g) => g.url !== exclude);
  const list = pool.length > 0 ? pool : WEB_GAMES;
  return list[Math.floor(Math.random() * list.length)] ?? WEB_GAMES[0]!;
}
