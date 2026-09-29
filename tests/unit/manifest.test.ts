import { describe, expect, it } from 'vitest';
import { HOST_PERMISSIONS, PERMISSIONS } from '../../manifest.config';

describe('manifest config', () => {
  it('keeps the permission list from the spec', () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
        'alarms',
        'downloads',
        'downloads.open',
        'idle',
        'notifications',
        'offscreen',
        'storage',
      ].sort(),
    );
    expect(HOST_PERMISSIONS).toEqual(['https://www.udbvirtual.edu.sv/auladigital/*']);
  });
});
