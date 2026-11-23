# Swara — voice-avatar vlog studio

Clone your own voice from a short sample (ElevenLabs), pair it with a portrait photo, and turn scripts into lip-synced talking-head videos for vlogs.

## Environment variables
| Key | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase publishable key |
| `ELEVENLABS_API_KEY` | yes | Voice cloning + speech |
| `ELEVENLABS_MODEL_ID` | no | Default `eleven_multilingual_v2` |
| `FAL_KEY` | for video | HeyGen Avatar 6 via fal (default avatar engine) |
| `DID_API_KEY` | alt. | D-ID talking photo, if `AVATAR_PROVIDER=did` |
| `AVATAR_PROVIDER` | no | `fal` (default) or `did` |
| `FAL_AVATAR_MODEL` | no | Default `heygen/avatar-6/image-to-video` |

## Flow
1. **Voices** — record or upload 1–3 min of speech, sign consent → ElevenLabs instant voice clone.
2. **Avatars** — upload a 9:16 portrait, sign consent.
3. **Studio** — write the script, choose voice, delivery and avatar → MP3 voice-over → avatar video (async; the vlog page polls until done and stores the MP4).

All files live in private Supabase Storage buckets under the owner's user id; tables use row-level security.
