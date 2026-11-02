import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => ({ demoMode:false }));
vi.mock('../../web/src/components/ui', () => ({ useLoad: () => ({ data:config }), toast:vi.fn() }));
import Onboarding from '../../web/src/pages/Onboarding';
let renderer:ReactTestRenderer;
afterEach(() => { if(renderer) act(() => renderer.unmount()); });
it.each([false,true])('shows the sample-week choice only when demo mode is %s', async demoMode => {
  config.demoMode = demoMode;
  await act(async () => { renderer = create(createElement(Onboarding, { onDone:vi.fn() })); });
  for(let step=0;step<5;step++) {
    if(step===2) act(() => renderer.root.findAllByType('input').find(i=>i.props['aria-label']==='First name')!.props.onChange({target:{value:'Test'}}));
    act(() => renderer.root.findAllByType('button').find(b=>b.props.className==='btn fill lg')!.props.onClick());
  }
  expect(JSON.stringify(renderer.toJSON()).includes('Explore with a sample week')).toBe(demoMode);
});
