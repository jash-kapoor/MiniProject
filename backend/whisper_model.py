from faster_whisper import WhisperModel

# Load Faster-Whisper base model (runs on CPU by default)
# Use "small", "medium", or "large-v3" for better accuracy
model = WhisperModel("base", device="cpu", compute_type="int8")


def transcribe_audio(audio_path: str) -> str:
    """
    Transcribes an audio file to text using Faster-Whisper.

    Args:
        audio_path: Path to the audio file (wav, mp3, etc.)

    Returns:
        Full transcript text as a single string.
    """
    segments, info = model.transcribe(audio_path, beam_size=5)

    transcript_parts = []
    for segment in segments:
        transcript_parts.append(segment.text.strip())

    transcript = " ".join(transcript_parts)
    return transcript
