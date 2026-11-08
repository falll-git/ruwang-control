import { z } from "zod";

const uuid = z.string().uuid();
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const qualifiedSubject = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}:[^\r\n]{1,180}$/);
const nullableUrl = z.string().url().nullable();

const mediaSchema = z.object({
  source_media_id: uuid,
  central_media_id: uuid,
  state: z.literal("READY"),
  detected_mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().positive().max(2560),
  height: z.number().int().positive().max(2560),
  is_cover: z.boolean().optional(),
  position: z.number().int().positive().optional(),
  alt_text: z.string().min(1).max(200).optional(),
}).strict();

const profileDetailSchema = z.object({
  kind: z.literal("profile"),
  public_name: z.string().min(1).max(200),
  public_slug: z.string().min(1).max(160),
  short_description: z.string().min(1).max(1000),
  city_regency: z.string().min(1).max(150),
  province: z.string().min(1).max(150),
  website_url: nullableUrl,
  logo: mediaSchema,
}).strict();

const contactDetailSchema = z.object({
  kind: z.literal("contact"),
  label: z.string().min(1).max(160),
  phone_e164: z.string().regex(/^\+[1-9]\d{7,14}$/),
  message_template_version: z.number().int().positive(),
}).strict();

const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const publicationDetailSchema = z.object({
  kind: z.literal("publication"),
  reference_code: z.string().min(1).max(80),
  category: z.string().min(1).max(80),
  subcategory: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  description: z.string().min(1).max(5000),
  city_regency: z.string().min(1).max(150),
  province: z.string().min(1).max(150),
  availability: z.string().min(1).max(80),
  attributes: z.record(z.string().max(80), scalar),
  media: z.array(mediaSchema).min(1).max(10),
  contact: z.object({ label: z.string().min(1).max(160), phone_e164: z.string().regex(/^\+[1-9]\d{7,14}$/) }).strict(),
  profile: z.object({ public_name: z.string().min(1).max(200), public_slug: z.string().min(1).max(160) }).strict(),
}).strict();

const changeRequestDetailSchema = z.object({
  kind: z.literal("change_request"),
  action: z.enum([
    "UNPUBLISH_PUBLICATION", "ARCHIVE_PUBLICATION", "HIDE_PROFILE",
    "REVOKE_CONTACT", "REVOKE_MEDIA", "RECONFIRM_PUBLICATION",
  ]),
  target_kind: z.enum(["PUBLICATION", "PROFILE", "CONTACT", "MEDIA"]),
  target_id: uuid,
  target_label: z.string().min(1).max(240),
  current_state: z.string().min(1).max(80),
  reason: z.string().min(10).max(1000),
  expected_public_visibility: z.enum(["visible", "not_visible", "not_applicable"]),
  blockers: z.array(z.string().min(1).max(300)).max(50),
  affected_publications: z.number().int().nonnegative(),
  affected_media: z.number().int().nonnegative(),
  central_synced: z.boolean(),
  reference_code: z.string().min(1).max(80).nullable(),
  public_slug: z.string().min(1).max(160).nullable(),
  media: z.array(mediaSchema).max(10),
}).strict();

export const reviewSnapshotEnvelopeSchema = z.object({
  contract_version: z.literal(1),
  snapshot_id: uuid,
  instance_id: uuid,
  resource: z.object({ kind: z.enum(["publication", "profile", "contact", "change_request"]), id: uuid }).strict(),
  source_version: z.number().int().positive(),
  payload_checksum: checksum,
  state: z.literal("IN_REVIEW"),
  contributor_subjects: z.array(qualifiedSubject).min(1).max(20).refine(values => new Set(values).size === values.length),
  submitted_at: z.string().datetime({ offset: true }),
  detail: z.discriminatedUnion("kind", [profileDetailSchema, contactDetailSchema, publicationDetailSchema, changeRequestDetailSchema]),
}).strict().superRefine((value, context) => {
  if (value.resource.kind !== value.detail.kind) {
    context.addIssue({ code: "custom", path: ["detail", "kind"], message: "jenis detail tidak sama dengan resource" });
  }
});

export type ReviewSnapshotEnvelope = z.infer<typeof reviewSnapshotEnvelopeSchema>;
export type ReviewDetail = ReviewSnapshotEnvelope["detail"];
