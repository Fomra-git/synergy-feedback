-- =============================================================================
-- Synergy Feedback — DEVELOPMENT seed data
-- Never run against production. Applied automatically by `supabase db reset`.
-- =============================================================================

insert into public.branches (id, name, code, address, phone, email, manager_name, status) values
  ('b0000000-0000-4000-8000-000000000001', 'Anna Nagar', 'ANN', '2nd Avenue, Anna Nagar, Chennai 600040', '+91 44 4000 1001', 'annanagar@synergywellness.example', 'Priya Raman', 'active'),
  ('b0000000-0000-4000-8000-000000000002', 'T. Nagar', 'TNR', 'Usman Road, T. Nagar, Chennai 600017', '+91 44 4000 1002', 'tnagar@synergywellness.example', 'Arjun Mehta', 'active'),
  ('b0000000-0000-4000-8000-000000000003', 'Porur', 'POR', 'Mount Poonamallee Road, Porur, Chennai 600116', '+91 44 4000 1003', 'porur@synergywellness.example', 'Divya Krishnan', 'active'),
  ('b0000000-0000-4000-8000-000000000004', 'Velachery', 'VEL', '100 Feet Road, Velachery, Chennai 600042', '+91 44 4000 1004', 'velachery@synergywellness.example', 'Karthik Subramanian', 'active')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Forms
-- -----------------------------------------------------------------------------
insert into public.forms (id, branch_id, name, slug, description, status, settings) values
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Patient Feedback', 'patient-feedback',
   'Your feedback helps us improve our physiotherapy services.', 'published',
   '{"appearance": {"primaryColor": "#0f766e", "backgroundColor": "#f0fdfa", "buttonColor": "#0f766e", "font": "inter"},
     "behavior": {"showProgressBar": false, "submitButtonText": "Submit Feedback", "successTitle": "Thank You!",
                  "successMessage": "Your feedback has been submitted successfully.", "showSubmissionNumber": true},
     "seo": {"title": "Patient Feedback — Synergy Wellness", "description": "Share your experience at Synergy Wellness."}}'),
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'Physiotherapy Experience', 'physiotherapy-experience',
   'Tell us about your physiotherapy sessions so we can tailor your care.', 'published',
   '{"appearance": {"primaryColor": "#1d4ed8", "backgroundColor": "#eff6ff", "buttonColor": "#1d4ed8", "font": "inter"},
     "behavior": {"showProgressBar": true, "submitButtonText": "Send", "successTitle": "Thank You!",
                  "successMessage": "We appreciate you taking the time to share your experience.", "showSubmissionNumber": true},
     "seo": {}}'),
  ('f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
   'Treatment Satisfaction', 'treatment-satisfaction',
   'A quick survey about your treatment outcome.', 'draft',
   '{"appearance": {"primaryColor": "#7c3aed", "backgroundColor": "#f5f3ff", "buttonColor": "#7c3aed", "font": "inter"},
     "behavior": {"showProgressBar": false, "submitButtonText": "Submit", "successTitle": "Thank You!",
                  "successMessage": "Your response has been recorded.", "showSubmissionNumber": true},
     "seo": {}}')
on conflict (id) do nothing;

-- Patient Feedback
insert into public.form_fields (form_id, field_id, type, label, description, placeholder, required, position, settings, validation, logic) values
  ('f0000000-0000-4000-8000-000000000001', 'patient_name', 'short_text', 'Patient Name', null, 'Your full name', true, 0, '{}', '{"minLength": 2, "maxLength": 120}', null),
  ('f0000000-0000-4000-8000-000000000001', 'phone', 'phone', 'Phone', null, '98765 43210', true, 1, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000001', 'email', 'email', 'Email', null, 'you@example.com', false, 2, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000001', 'treatment', 'dropdown', 'Treatment', null, 'Select a treatment', true, 3,
   '{"options": ["Physiotherapy", "Sports Rehabilitation", "Post-Surgery Rehabilitation", "Back & Neck Pain", "Massage Therapy", "Other"]}', '{}', null),
  ('f0000000-0000-4000-8000-000000000001', 'rating', 'star_rating', 'How was your experience?', null, null, true, 4, '{"max": 5}', '{}', null),
  ('f0000000-0000-4000-8000-000000000001', 'satisfied', 'yes_no', 'Are you satisfied with your treatment?', null, null, true, 5, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000001', 'what_went_wrong', 'long_text', 'Please tell us what went wrong.', 'We will use this to improve.', null, true, 6, '{}', '{"maxLength": 2000}',
   '{"action": "show", "match": "all", "conditions": [{"fieldId": "satisfied", "operator": "equals", "value": "No"}]}'),
  ('f0000000-0000-4000-8000-000000000001', 'comments', 'long_text', 'Additional Comments', null, 'Anything else you would like to share?', false, 7, '{}', '{"maxLength": 2000}', null)
on conflict (form_id, field_id) do nothing;

-- Physiotherapy Experience (multi-step via sections)
insert into public.form_fields (form_id, field_id, type, label, description, placeholder, required, position, settings, validation, logic) values
  ('f0000000-0000-4000-8000-000000000002', 'section_about', 'section', 'About You', 'A few details so we can follow up.', null, false, 0, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000002', 'full_name', 'short_text', 'Full Name', null, null, true, 1, '{}', '{"minLength": 2}', null),
  ('f0000000-0000-4000-8000-000000000002', 'phone', 'phone', 'Phone Number', null, null, true, 2, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000002', 'age', 'number', 'Age', null, null, false, 3, '{}', '{"min": 1, "max": 120}', null),
  ('f0000000-0000-4000-8000-000000000002', 'section_sessions', 'section', 'Your Sessions', null, null, false, 4, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000002', 'session_date', 'date', 'Date of last session', null, null, true, 5, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000002', 'treatment_type', 'radio', 'Treatment Type', null, null, true, 6,
   '{"options": ["Manual Therapy", "Exercise Therapy", "Electrotherapy", "Dry Needling", "Hydrotherapy"]}', '{}', null),
  ('f0000000-0000-4000-8000-000000000002', 'areas_improved', 'checkbox', 'Which areas have improved?', null, null, false, 7,
   '{"options": ["Pain level", "Mobility", "Strength", "Posture", "Sleep quality"]}', '{}', null),
  ('f0000000-0000-4000-8000-000000000002', 'pain_before_after', 'linear_scale', 'How much has your pain reduced?', null, null, true, 8,
   '{"min": 0, "max": 10, "minLabel": "Not at all", "maxLabel": "Completely"}', '{}', null),
  ('f0000000-0000-4000-8000-000000000002', 'therapist_rating', 'rating', 'Rate your physiotherapist', null, null, true, 9, '{"max": 10}', '{}', null),
  ('f0000000-0000-4000-8000-000000000002', 'recommend', 'yes_no', 'Would you recommend us to friends and family?', null, null, true, 10, '{}', '{}', null)
on conflict (form_id, field_id) do nothing;

-- Treatment Satisfaction (draft)
insert into public.form_fields (form_id, field_id, type, label, description, placeholder, required, position, settings, validation, logic) values
  ('f0000000-0000-4000-8000-000000000003', 'heading_intro', 'heading', 'Treatment Satisfaction Survey', null, null, false, 0, '{"level": 2}', '{}', null),
  ('f0000000-0000-4000-8000-000000000003', 'intro_text', 'paragraph', '', 'This survey takes about two minutes. Your answers are confidential.', null, false, 1, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000003', 'patient_name', 'short_text', 'Patient Name', null, null, true, 2, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000003', 'email', 'email', 'Email', null, null, false, 3, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000003', 'divider_1', 'divider', '', null, null, false, 4, '{}', '{}', null),
  ('f0000000-0000-4000-8000-000000000003', 'goals_met', 'multi_select', 'Which treatment goals were met?', null, null, false, 5,
   '{"options": ["Reduced pain", "Returned to sport", "Returned to work", "Improved daily activities", "Better flexibility"]}', '{}', null),
  ('f0000000-0000-4000-8000-000000000003', 'overall', 'star_rating', 'Overall satisfaction', null, null, true, 6, '{"max": 5}', '{}', null),
  ('f0000000-0000-4000-8000-000000000003', 'report', 'file_upload', 'Upload a medical report (optional)', 'PDF or image, up to 5 MB.', null, false, 7,
   '{"maxFiles": 1, "maxSizeMb": 5, "accept": ["image", "pdf"]}', '{}', null),
  ('f0000000-0000-4000-8000-000000000003', 'signature', 'signature', 'Signature', 'I confirm the above information is accurate.', null, true, 8, '{}', '{}', null)
on conflict (form_id, field_id) do nothing;

update public.form_settings
set notifications = '{"enabled": true, "recipients": ["admin@synergywellness.example"], "includeAnswers": false, "subject": "New {form} Submission – {branch}"}'::jsonb
where form_id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003');
