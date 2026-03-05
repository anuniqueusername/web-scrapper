import './globals.css';
import Sidebar from '@/components/layout/Sidebar';

export const metadata = {
  title: 'Kijiji Scraper Dashboard',
  description: 'Monitor and control your Kijiji scraper',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="dashboard-layout">
          <Sidebar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
