# URL Parameters

The emulator can open with media already inserted, so a link can hand someone a running program rather than a set of instructions.

```
https://your-emulator/?disk=https://example.com/demo.dsk
```

---

## Parameters

| Parameter | Target |
|-----------|--------|
| `disk` | Floppy drive 1 |
| `disk1` | Floppy drive 1 (synonym for `disk`, so links read naturally) |
| `disk2` | Floppy drive 2 |
| `hd` | SmartPort device 1 |
| `hd1` | SmartPort device 1 (synonym) |
| `hd2` | SmartPort device 2 |
| `name` | Display name for the loaded media |

Multiple parameters can be combined:

```
?disk1=game-side-a.dsk&disk2=game-side-b.dsk&name=My%20Game
```

## Accepted Images

Recognised extensions are `.dsk`, `.do`, `.po`, `.nib`, `.woz`, `.2mg` and `.hdv`.

Where a URL carries no usable filename -- which is common for share links from cloud storage -- the emulator sniffs the content, recognising the WOZ magic bytes and the exact 143,360-byte length of a standard `.dsk`.

## URLs and Security

Only `http` and `https` URLs are accepted. A **relative path is resolved against the page**, so images hosted alongside the emulator work with a short link:

```
?disk=/demos/lode-runner.dsk
```

Fetches are made with `credentials: "omit"`, so a link cannot use your cookies to reach something private, and each unit has a size ceiling: **8 MB** per floppy and **64 MB** per hard drive image. These are generous for real images but stop a link pulling down something unbounded.

The remote server must send permissive CORS headers for a cross-origin image to load; this is a browser rule the emulator cannot work around.

## Loads Are Transient

Media loaded from a URL is deliberately **not persisted**:

- it is not written to the browser's image storage,
- it is not added to the recent-images list,
- autosave is suspended for the session.

The reasoning is that a link should not quietly overwrite the disk you had in the drive. Your stored autosave preference is left untouched -- only this session's autosave is suspended.

## Implementation Notes

Two modules, deliberately split so the tricky part is testable:

| File | Responsibility |
|------|----------------|
| `src/js/utils/url-params.js` | Pure parsing and URL validation. Unit-tested in `tests/js/utils/url-params.test.js`. |
| `src/js/disk-manager/url-media-loader.js` | Fetching (size-capped, credential-less) and insertion. |

`main.js` parses the URL **before** `DiskManager.init()` and `HardDriveManager.init()`, populating `urlOwnedDrives` and `urlOwnedDevices`. Those managers use the lists to skip restoring a persisted image into a unit that a link is about to claim -- otherwise the two loads race, and which image you end up with depends on timing.

---

## See Also

- [[Disk-Drives]] -- floppy drives and formats
- [[SmartPort-Hard-Drives]] -- hard drive volumes
