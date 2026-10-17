import { readFileSync } from 'fs';
import { join } from 'path';

const MAIN_ACTIVITY = readFileSync(
  join(
    __dirname,
    '../android/app/src/main/java/com/keycardpal/MainActivity.kt',
  ),
  'utf8',
);

describe('MainActivity', () => {
  it('never restores saved state, which react-native-screens cannot take', () => {
    expect(MAIN_ACTIVITY).toContain('super.onCreate(null)');
    expect(MAIN_ACTIVITY).not.toContain('super.onCreate(savedInstanceState)');
  });
});
