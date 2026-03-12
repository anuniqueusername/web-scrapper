'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
    { href: '/settings', label: 'Settings', icon: 'fa-gear' },
    { href: '/listings', label: 'Listings', icon: 'fa-list' },
    { href: '/logs', label: 'Logs', icon: 'fa-file-lines' },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h1><i className="fas fa-spider"></i> Scraper</h1>
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
                <span className={styles.icon}><i className={`fas ${item.icon}`}></i></span>
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
