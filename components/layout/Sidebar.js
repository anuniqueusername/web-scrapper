'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: '📊 Dashboard', icon: '📊' },
    { href: '/settings', label: '⚙️ Settings', icon: '⚙️' },
    { href: '/listings', label: '📋 Listings', icon: '📋' },
    { href: '/logs', label: '📝 Logs', icon: '📝' },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h1>🕷️ Scraper</h1>
      </div>

      <nav className={styles.nav}>
        <ul className={styles.navList}>
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.navLink} ${
                  pathname === item.href ? styles.active : ''
                }`}
              >
                <span className={styles.icon}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.footer}>
        <p>v1.0.0</p>
      </div>
    </aside>
  );
}
