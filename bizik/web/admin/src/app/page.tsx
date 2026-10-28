import { redirect } from 'next/navigation';

/**
 * Entry point. The `(app)` group guards its own routes client-side (tokens live
 * in localStorage, unreadable on the server), so we forward to the dashboard,
 * which bounces to `/login` when there's no privileged session.
 */
export default function Home() {
  redirect('/dashboard');
}
