import './globals.css';
import Sidebar from '@/components/layout/Sidebar';

export const metadata = {
  title: 'Kijiji Scraper Dashboard',
  description: 'Monitor and control your Kijiji scraper',
  icons: {
    icon: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          integrity="sha512-iecdLmaskl7CVJkEZSMUkrQ6usKEqLqpEQEQZLg9c+fs4S5n5k5Y2hMQKpwVBL7n3cXWEVRRVQvJpUNuYe1Nz6Q=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
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
