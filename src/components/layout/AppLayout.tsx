import { Link, NavLink, Outlet } from 'react-router-dom';
import { cx } from '@/lib/cx';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';
import { Button, Icon, type IconName } from '@/components/ui';
import styles from './AppLayout.module.css';

const NAV_ITEMS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/', label: '내 레시피', icon: 'book', end: true },
  { to: '/add', label: '레시피 추가', icon: 'plus' },
  { to: '/fridge', label: '냉장고 추천', icon: 'fridge' },
];

const THEME_META: Record<ThemeMode, { icon: IconName; label: string }> = {
  light: { icon: 'sun', label: '라이트 모드 (눌러서 다크로)' },
  dark: { icon: 'moon', label: '다크 모드 (눌러서 시스템 설정으로)' },
  system: { icon: 'monitor', label: '시스템 설정 따름 (눌러서 라이트로)' },
};

export function AppLayout() {
  const { mode, cycle } = useTheme();
  const theme = THEME_META[mode];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.brandMark}>
              <Icon name="chef" size={20} />
            </span>
            레시피 노트
          </Link>
          <nav className={styles.nav} aria-label="주요 메뉴">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cx(styles.navLink, isActive && styles.active)}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className={styles.spacer} />
          <Button variant="ghost" iconOnly icon={theme.icon} onClick={cycle} aria-label={theme.label} title={theme.label} />
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <nav className={styles.tabbar} aria-label="하단 메뉴">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cx(styles.tab, isActive && styles.active)}
          >
            <Icon name={item.icon} size={22} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
