import { readFileSync } from 'fs';
import { join } from 'path';

const CAMERA_VIEW = readFileSync(
  join(__dirname, '../android/app/src/main/java/com/keycardpal/CameraView.kt'),
  'utf8',
);

describe('Android CameraView', () => {
  it('takes a new analysis executor and reader on every attach', () => {
    expect(CAMERA_VIEW).not.toMatch(/val executor\b/);
    expect(CAMERA_VIEW).not.toMatch(/val reader = MultiFormatReader/);
    expect(CAMERA_VIEW).toContain('Executors.newSingleThreadExecutor()');
    expect(CAMERA_VIEW).toContain('val reader = newReader()');
  });

  it('releases the camera when the view leaves the window', () => {
    const detach = CAMERA_VIEW.slice(
      CAMERA_VIEW.indexOf('override fun onDetachedFromWindow'),
    );
    expect(detach).toContain('stopCamera()');
    expect(CAMERA_VIEW).toContain('cameraProvider?.unbind(*useCases)');
  });
});
