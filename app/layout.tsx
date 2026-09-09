import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {appleWebApp: {capable:true,title:'Mini Duel',statusBarStyle:'default'}, manifest:'/manifest.webmanifest',icons: { icon: '/crossword-icon.svg' }, title: 'Mini Duel — Head-to-head crossword', description: 'Race another player on the same mini crossword. First to solve wins.'};
export default function RootLayout({children}: {children: React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}

// #checked 9/9/2025
