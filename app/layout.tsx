import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {icons: { icon: '/crossword-icon.svg' }, title: 'Mini Duel — Head-to-head crossword', description: 'Race another player on the same mini crossword. First to solve wins.'};
export default function RootLayout({children}: {children: React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
