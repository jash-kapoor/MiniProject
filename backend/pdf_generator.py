import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)

from sqlalchemy.orm import Session
import models


def generate_interview_pdf(interview_id: int, db: Session) -> bytes:
    """Generate a PDF report for the given interview."""
    interview = (
        db.query(models.Interview)
        .filter(models.Interview.id == interview_id)
        .first()
    )
    if not interview:
        raise ValueError("Interview not found")

    evaluation = (
        db.query(models.Evaluation)
        .filter(models.Evaluation.interview_id == interview_id)
        .first()
    )

    candidate = (
        db.query(models.User)
        .filter(models.User.id == interview.candidate_id)
        .first()
    )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle(
        'CustomTitle', parent=styles['Title'],
        fontSize=22, spaceAfter=6, textColor=colors.HexColor('#1e3a5f')
    )
    story.append(Paragraph("VoxAssess AI - Interview Report", title_style))
    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#3b82f6')))
    story.append(Spacer(1, 6*mm))

    # Candidate Info
    info_style = styles['Normal']
    candidate_name = candidate.full_name if candidate else "Unknown"
    candidate_email = candidate.email if candidate else "N/A"
    story.append(Paragraph(f"<b>Candidate:</b> {candidate_name}", info_style))
    story.append(Paragraph(f"<b>Email:</b> {candidate_email}", info_style))
    story.append(Paragraph(f"<b>Position:</b> {interview.job_title}", info_style))
    story.append(Paragraph(f"<b>Date:</b> {interview.created_at.strftime('%B %d, %Y')}", info_style))
    story.append(Paragraph(f"<b>Status:</b> {interview.status}", info_style))
    story.append(Spacer(1, 8*mm))

    if evaluation:
        # Overall Score
        score_style = ParagraphStyle(
            'ScoreStyle', parent=styles['Heading2'],
            fontSize=16, textColor=colors.HexColor('#1e3a5f')
        )
        story.append(Paragraph("Score Summary", score_style))
        story.append(Spacer(1, 4*mm))

        score_data = [
            ["Metric", "Score"],
            ["Overall Score", f"{evaluation.overall_score or 0:.1f}"],
            ["Speech Score", f"{evaluation.speech_score or 0:.1f}"],
            ["NLP Score", f"{evaluation.nlp_score or 0:.1f}"],
            ["Vision Score", f"{evaluation.vision_score or 0:.1f}"],
            ["Fairness Score", f"{evaluation.fairness_score or 0:.1f}"],
            ["Fairness Adjustment", f"{evaluation.fairness_adjustment or 0:.1f}"],
        ]

        table = Table(score_data, colWidths=[200, 100])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(table)
        story.append(Spacer(1, 8*mm))

        # Detailed Answers
        feedback = evaluation.detailed_feedback
        if feedback and isinstance(feedback, dict):
            answers = feedback.get("answers", [])
            if answers:
                story.append(Paragraph("Answer Breakdown", score_style))
                story.append(Spacer(1, 4*mm))
                for i, ans in enumerate(answers):
                    story.append(Paragraph(f"<b>Answer {i+1}</b>", styles['Heading4']))
                    transcript = ans.get("transcript", "N/A")
                    story.append(Paragraph(f"<i>\"{transcript}\"</i>", styles['Normal']))
                    story.append(Spacer(1, 2*mm))

                    scores = ans.get("scores", {})
                    if scores:
                        score_items = [["Dimension", "Score"]]
                        for dim in ["content_relevance", "fluency", "vocabulary", "confidence", "structure"]:
                            score_items.append([dim.replace('_', ' ').title(), f"{scores.get(dim, 0)}/20"])
                        score_items.append(["Overall", f"{scores.get('overall_score', 0)}"])

                        ans_table = Table(score_items, colWidths=[160, 80])
                        ans_table.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6366f1')),
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                            ('FONTSIZE', (0, 0), (-1, -1), 9),
                            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
                        ]))
                        story.append(ans_table)
                    story.append(Spacer(1, 4*mm))
    else:
        story.append(Paragraph("No evaluation data available for this interview.", styles['Normal']))

    # Footer
    story.append(Spacer(1, 10*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=colors.grey)
    story.append(Paragraph(f"Generated by VoxAssess AI on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", footer_style))

    doc.build(story)
    return buffer.getvalue()
