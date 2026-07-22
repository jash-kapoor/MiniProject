import os
import shutil
import subprocess
import tempfile
try:
    from faster_whisper import WhisperModel
    if shutil.which("ffmpeg") is None:
        model = None
    else:
        model = WhisperModel("base", device="cpu", compute_type="int8")
except (ImportError, RuntimeError, Exception) as e:
    model = None



def transcribe_audio(audio_path: str) -> str:
    """
    Transcribes an audio file to text using Faster-Whisper.

    Args:
        audio_path: Path to the audio file (wav, mp3, etc.)

    Returns:
        Full transcript text as a single string.
    """
    if model is None:
        return "Audio transcription unavailable (Whisper model or ffmpeg not loaded)."
    transcribe_path = audio_path
    temp_wav_path = None

    if not audio_path.lower().endswith(".wav"):
        temp_wav_path = tempfile.mktemp(suffix=".wav")
        subprocess.run(
            [
                "ffmpeg",
                "-i", audio_path,
                "-ar", "16000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                temp_wav_path
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        transcribe_path = temp_wav_path

    try:
        segments, info = model.transcribe(transcribe_path, beam_size=5)

        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text.strip())

        transcript = " ".join(transcript_parts)
        return transcript
    finally:
        if temp_wav_path and os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)
