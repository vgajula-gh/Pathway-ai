import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ api: vi.fn(), id: null as string | null, code: 'code-one' as string | null }));
vi.mock('../../web/src/lib/api', () => ({
  api: state.api,
  ApiError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  session: { get: () => state.id, set: (id: string) => { state.id = id; }, clear: () => { state.id = null; } },
  access: { get: () => state.code, set: (code: string) => { state.code = code; }, clear: () => { state.code = null; } }
}));
vi.mock('../../web/src/lib/theme', () => ({ THEMES: [['dusk', 'Dusk', 'moon']], applyTheme: vi.fn(), nextTheme: vi.fn() }));
vi.mock('../../web/src/components/ui', async () => ({ ...await vi.importActual('../../web/src/components/ui'), toast: vi.fn() }));
vi.mock('../../web/src/pages/Today', () => ({ default: () => 'Dashboard' }));
vi.mock('../../web/src/pages/Explore', () => ({ default: () => null }));
vi.mock('../../web/src/pages/Buddy', () => ({ default: () => null }));
vi.mock('../../web/src/pages/Grow', () => ({ default: () => null }));
vi.mock('../../web/src/pages/You', () => ({ default: () => null }));
import App from '../../web/src/App';
import Onboarding from '../../web/src/pages/Onboarding';
import { ApiError } from '../../web/src/lib/api';
const student = { id: 'existing-student', name: 'Sam', hasSignIn: true, settings: { theme: 'dusk' } };
let renderer: ReactTestRenderer;
const mount = async () => { await act(async () => { renderer = create(createElement(App)); }); };
const text = () => JSON.stringify(renderer.toJSON());
beforeEach(() => {
  state.api.mockReset(); state.id = null; state.code = 'code-one';
  vi.stubGlobal('document', { body: { dataset: {} } });
  vi.stubGlobal('window', { scrollTo: vi.fn() });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });
it('opens Today directly from a remembered account session, even without a local student ID or access code', async () => {
  state.code = null;
  state.api.mockImplementation(async path => path === '/api/config' ? { accessRequired: true } : { student });
  await mount();
  expect(text()).toContain('Dashboard'); expect(text()).not.toContain('Get started'); expect(text()).not.toContain('Welcome back');
  expect(state.id).toBe(student.id);
});
it('signs in on a new device and opens the existing dashboard without onboarding', async () => {
  state.api.mockImplementation(async path => {
    if (path === '/api/config') return { accessRequired: true };
    if (path === '/api/auth/session') return { student: null };
    if (path === '/api/auth/login') return student;
    return { ok: true };
  });
  await mount();
  expect(text()).toContain('Welcome back'); expect(text()).not.toContain('Get started');
  await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  expect(text()).toContain('Dashboard'); expect(state.id).toBe(student.id);
  expect(state.api.mock.calls.some(([path]) => path === '/api/students')).toBe(false);
});
it('preserves the old browser profile on a server failure and retries instead of showing setup', async () => {
  state.id = student.id; let failed = true;
  state.api.mockImplementation(async path => {
    if (path === '/api/config') return { accessRequired: false };
    if (path === '/api/auth/session') return { student: null };
    if (path === '/api/me') { if (failed) throw new ApiError(503, 'Unavailable'); return student; }
    return { ok: true };
  });
  await mount();
  expect(text()).toContain('Your saved profile is safe'); expect(text()).not.toContain('Get started'); expect(state.id).toBe(student.id);
  failed = false;
  await act(async () => { renderer.root.findByType('button').props.onClick(); });
  expect(text()).toContain('Dashboard'); expect(state.id).toBe(student.id);
});
it('shows sign-in after a session expires and starts onboarding only when explicitly chosen', async () => {
  state.id = student.id;
  state.api.mockImplementation(async path => {
    if (path === '/api/config') return { accessRequired: false };
    if (path === '/api/auth/session') return { student: null };
    if (path === '/api/me') throw new ApiError(401, 'Sign in to open your profile.');
    return { ok: true };
  });
  await mount(); expect(text()).toContain('Welcome back'); expect(state.id).toBe(student.id);
  await act(async () => { renderer.root.findAllByType('button').find(b => b.children.join('').includes('Create a profile'))!.props.onClick(); });
  expect(text()).toContain('Get started'); expect(text()).toContain('Back to sign in');
});

it('shows the one-time recovery code and requires saving it before opening the dashboard', async () => {
  state.api.mockImplementation(async path => {
    if (path === '/api/auth/session') return { student: null };
    if (path === '/api/auth/login') return { ...student, recoveryCode: 'saved-once-code' };
    return { accessRequired: true };
  });
  await mount();
  await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  expect(text()).toContain('Save your recovery code'); expect(text()).not.toContain('Dashboard');
  let open = renderer.root.findAllByType('button').find(b => b.children.join('').includes('Open my dashboard'))!;
  expect(open.props.disabled).toBe(true);
  await act(async () => { renderer.root.findAllByType('input').find(i => i.props.type === 'checkbox')!.props.onChange({ target: { checked: true } }); });
  open = renderer.root.findAllByType('button').find(b => b.children.join('').includes('Open my dashboard'))!;
  expect(open.props.disabled).toBe(false);
  await act(async () => { open.props.onClick(); });
  expect(text()).toContain('Dashboard'); expect(text()).not.toContain('saved-once-code');
});
it('asks for an invitation only when a new visitor chooses to create a profile', async () => {
  state.code = null;
  state.api.mockImplementation(async path => path === '/api/auth/session' ? { student: null } : path === '/api/config' ? { accessRequired: true } : { ok: true });
  await mount(); expect(text()).toContain('Welcome back'); expect(text()).not.toContain('Your invitation');
  await act(async () => { renderer.root.findAllByType('button').find(b => b.children.join('').includes('Create a profile'))!.props.onClick(); });
  expect(text()).toContain('Your invitation to Pathway'); expect(text()).not.toContain('Get started');
  await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  expect(text()).toContain('Get started');
});

it('keeps calendar onboarding and private phrase setup in the same completed profile flow', async () => {
  const done = vi.fn();
  state.api.mockImplementation(async path => path === '/api/students' ? { ...student, recoveryCode: 'save-once' } : { ok: true });
  await act(async () => { renderer = create(createElement(Onboarding, { onDone: done })); });
  const next = async () => act(async () => { renderer.root.findAllByType('button').find(b => b.props.className === 'btn fill lg')!.props.onClick(); });
  await next(); await next(); // Welcome, privacy → name
  await act(async () => { renderer.root.findByProps({ 'aria-label': 'First name' }).props.onChange({ target: { value: 'Sam' } }); });
  await next(); await next(); await next(); await next(); // Name, interests, goal, study window → calendar
  expect(text()).toContain('Add your calendar?');
  await act(async () => { renderer.root.findByProps({ id: 'onboard-calendar' }).props.onChange({ target: { value: 'https://example.org/private.ics' } }); });
  await next();
  expect(text()).toContain('Keep your journey with you');
  await act(async () => {
    for (const id of ['private-phrase', 'confirm-phrase']) renderer.root.findByProps({ id }).props.onChange({ target: { value: 'forest comet river bicycle' } });
  });
  await next();
  expect(state.api.mock.calls.find(([path]) => path === '/api/students')?.[1].body.credentials).toEqual({ phrase: 'forest comet river bicycle', confirmPhrase: 'forest comet river bicycle' });
  expect(state.api.mock.calls.find(([path]) => path === '/api/calendars')?.[1].body.url).toBe('https://example.org/private.ics');
  expect(done).toHaveBeenCalledWith(expect.objectContaining({ id: student.id, recoveryCode: 'save-once' }));
});
it('preserves a notification target through phrase sign-in', async () => {
  window.location = { search: '?tab=explore' } as Location;
  state.api.mockImplementation(async path => path === '/api/auth/session' ? { student: null } : path === '/api/auth/login' ? student : { accessRequired: true });
  await mount();
  await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  expect(renderer.root.findAllByProps({ role: 'tab' }).find(t => t.findByType('span').children.join('') === 'Explore')?.props['aria-selected']).toBe(true);
});
