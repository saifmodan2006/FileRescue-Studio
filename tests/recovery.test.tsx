// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {Findings,Pages} from '../src/components/recovery';
import {Button} from '../src/components/ui/button';

afterEach(cleanup);
describe('recovery controls',() => {
  it('keeps unreadable pages out of the selection controls',() => {
    const selected:number[] = [];
    render(<Pages selected={[]} onToggle={page => selected.push(page)} pages={[
      {number:1,readable:true},{number:2,readable:false,detail:'Stream failed'},
    ]}/>);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox',{name:'Page 1'}));
    expect(selected).toEqual([1]);
    expect(screen.getByText('Page 2 · Unreadable')).toBeTruthy();
  });
  it('shows warning details as text',() => {
    render(<Findings items={[{severity:'warning',title:'Unrecognized input',detail:'<script>never attach HTML</script>'}]}/>);
    expect(screen.getByRole('listitem').textContent).toContain('<script>never attach HTML</script>');
    expect(document.querySelector('script')).toBeNull();
  });
  it('does not invoke a disabled recovery button',() => {
    let called = false;
    render(<Button disabled onClick={() => {called = true;}}>Attempt recovery</Button>);
    fireEvent.click(screen.getByRole('button',{name:'Attempt recovery'}));
    expect(called).toBe(false);
  });
});
