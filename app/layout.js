import './globals.css';

export const metadata = {
  title: 'Scraper Manager',
  description: 'Manage scraper parameters, scheduling, and results',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
