Diagnostic only. Result (2026-09-07): Maestro exposes NO endpoint to host call
recording media — every candidate route returns 404:

    /api/v1/users/{b}/calls/{c}/recording|recordings|recording/upload|
    recording/upload-url|recording/presigned|media|attachments|files|audio|
    upload|recording-url|import-recording, /api/v1/users/{b}/recordings,
    /api/v1/recordings, /telecom/api/v1/...

Only `PUT /api/v1/users/{b}/calls/{c}` exists (GET is 405). Hosting the audio
in Maestro's own S3 therefore requires Maestro (Scott) to expose an upload
endpoint or provide S3 write credentials. Meanwhile `pp-recording-play`
streams the audio itself (audio/wav, Range, CORS) so any HTML5 player works.
