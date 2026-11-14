# ClamAV Setup Guide for Windows

## 1. Download and install the x64 MSI

1. Download the current **64-bit Windows MSI** installer from the [official ClamAV downloads page](https://www.clamav.net/downloads).
2. Run the `.msi` file as an administrator.
3. Install ClamAV to the default location, for example:

	```text
	C:\Program Files\ClamAV
	```

## 2. Add ClamAV to the system PATH

1. Open **System Properties** → **Advanced** → **Environment Variables**.
2. Under **System variables**, select `Path` → **Edit** → **New**.
3. Add the ClamAV installation directory:

	```text
	C:\Program Files\ClamAV
	```

4. Confirm all dialogs, then open a new Administrator PowerShell window.
5. Verify the installation:

	```powershell
	clamd.exe --version
	```

## 3. Create and edit the configuration files

Open PowerShell as Administrator and switch to the installation directory:

```powershell
cd 'C:\Program Files\ClamAV'
Copy-Item .\conf_examples\clamd.conf.sample .\clamd.conf
Copy-Item .\conf_examples\freshclam.conf.sample .\freshclam.conf
```

Edit both files and remove or comment out the line containing only `Example`.

In `clamd.conf`, set or uncomment the following values:

```ini
LogFile C:\Program Files\ClamAV\clamd.log
DatabaseDirectory C:\Program Files\ClamAV\database
TCPSocket 3310
TCPAddr 127.0.0.1
```

In `freshclam.conf`, set or uncomment:

```ini
DatabaseDirectory C:\Program Files\ClamAV\database
UpdateLogFile C:\Program Files\ClamAV\freshclam.log
DatabaseMirror database.clamav.net
```

Create the database directory if it does not exist, then download the initial signatures:

```powershell
New-Item -ItemType Directory -Force 'C:\Program Files\ClamAV\database'
freshclam.exe --config-file='C:\Program Files\ClamAV\freshclam.conf'
```

## 4. Start `clamd`

Start the ClamAV daemon using the configuration file:

```powershell
clamd.exe --config-file='C:\Program Files\ClamAV\clamd.conf'

or:
net start clamd
```

Leave this window open while `clamd` is running. In another Administrator PowerShell window, verify that it is listening on port `3310`:

```powershell
Test-NetConnection 127.0.0.1 -Port 3310
```

To stop the daemon, press `Ctrl+C` in the window running `clamd`.
