'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';
import ReportDialog from '../ReportDialog';

export default function Sidebar() {
  const pathname = usePathname();
  const [reportOpen, setReportOpen] = useState(false);

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
    { href: '/settings', label: 'Settings', icon: 'fa-gear' },
    { href: '/listings', label: 'Listings', icon: 'fa-list' },
    { href: '/logs', label: 'Logs', icon: 'fa-file-lines' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
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
          <button
            onClick={() => setReportOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              background: 'rgba(216, 180, 254, 0.06)',
              border: '1px solid rgba(216, 180, 254, 0.12)',
              borderRadius: '8px',
              color: 'rgba(216, 180, 254, 0.6)',
              fontSize: '13px',
              fontWeight: 500,
              padding: '9px 14px',
              cursor: 'pointer',
              marginBottom: '12px',
              transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(216, 180, 254, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(216, 180, 254, 0.25)';
              e.currentTarget.style.color = '#d8b4fe';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(216, 180, 254, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(216, 180, 254, 0.12)';
              e.currentTarget.style.color = 'rgba(216, 180, 254, 0.6)';
            }}
          >
            <i className="fas fa-flag" style={{ fontSize: '13px' }}></i>
            Report Issue
          </button>
          <p>v1.0.0</p>
        </div>
      </aside>

      {/* Mobile Header Bar — horizontal scrollable nav tabs */}
      <header className={styles.mobileHeader}>
        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.mobileNavLink} ${
                pathname === item.href ? styles.mobileNavLinkActive : ''
              }`}
            >
              <i className={`fas ${item.icon} ${styles.mobileNavIcon}`}></i>
              <span className={styles.mobileNavLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      {/* Report Issue modal — rendered at top level to avoid stacking context issues */}
      {reportOpen && <ReportDialog onClose={() => setReportOpen(false)} />}
    </>
  );
}
