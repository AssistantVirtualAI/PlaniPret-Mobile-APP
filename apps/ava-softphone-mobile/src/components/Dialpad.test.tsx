/**
 * Regression: pressing each dialpad key MUST insert exactly one digit.
 * The Dialpad uses pointerdown (fires once for both mouse and touch)
 * with a small dedupe window. onClick is a no-op.
 */
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import Dialpad from './Dialpad';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function setup() {
  const presses: string[] = [];
  const utils = render(<Dialpad onPress={(d) => presses.push(d)} />);
  const buttons = utils.container.querySelectorAll('button');
  return { presses, buttons };
}

describe('Dialpad single-digit guarantee', () => {
  it('a pointerdown on each key inserts exactly one digit', () => {
    const { presses, buttons } = setup();
    buttons.forEach((b) => fireEvent.pointerDown(b));
    expect(presses).toEqual(KEYS);
  });

  it('a pointerdown followed by a synthetic click inserts exactly one digit', () => {
    const { presses, buttons } = setup();
    buttons.forEach((b) => {
      fireEvent.pointerDown(b);
      fireEvent.pointerUp(b);
      fireEvent.click(b); // synthetic click — must be ignored
    });
    expect(presses).toEqual(KEYS);
  });

  it('does not insert two digits when pointerdown fires twice in the same tick', () => {
    const { presses, buttons } = setup();
    const two = buttons[1]; // key "2"
    fireEvent.pointerDown(two);
    fireEvent.pointerDown(two); // dedupe by 50ms guard
    expect(presses).toEqual(['2']);
  });
});
