// FusionPBX v5 field map per resource.
// Used by PbxRowEditDialog / IvrEditDialog so "All fields" dialogs render
// every column expected by the FusionPBX API in stable order with the right
// input kind and human label.
//
// Keep keys aligned with FusionPBX column names — they are sent verbatim
// in `update-*` params and forwarded by pbx-write → fusionpbx-proxy.

export type FieldKind = 'text' | 'textarea' | 'bool' | 'number' | 'password';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  group?: string;
  readOnly?: boolean;
  placeholder?: string;
}

export type ResourceKind =
  | 'extension'
  | 'ivr'
  | 'ivr_option'
  | 'queue'
  | 'ring_group'
  | 'device'
  | 'destination'
  | 'voicemail';

const ext: FieldSpec[] = [
  { key: 'extension', label: 'Extension', kind: 'text', group: 'Identity' },
  { key: 'number_alias', label: 'Number alias', kind: 'text', group: 'Identity' },
  { key: 'password', label: 'SIP password', kind: 'password', group: 'Auth' },
  { key: 'accountcode', label: 'Account code', kind: 'text', group: 'Identity' },
  { key: 'effective_caller_id_name', label: 'Effective CID name', kind: 'text', group: 'Caller ID' },
  { key: 'effective_caller_id_number', label: 'Effective CID number', kind: 'text', group: 'Caller ID' },
  { key: 'outbound_caller_id_name', label: 'Outbound CID name', kind: 'text', group: 'Caller ID' },
  { key: 'outbound_caller_id_number', label: 'Outbound CID number', kind: 'text', group: 'Caller ID' },
  { key: 'emergency_caller_id_name', label: 'Emergency CID name', kind: 'text', group: 'Caller ID' },
  { key: 'emergency_caller_id_number', label: 'Emergency CID number', kind: 'text', group: 'Caller ID' },
  { key: 'directory_first_name', label: 'First name', kind: 'text', group: 'Directory' },
  { key: 'directory_last_name', label: 'Last name', kind: 'text', group: 'Directory' },
  { key: 'directory_visible', label: 'Directory visible', kind: 'bool', group: 'Directory' },
  { key: 'directory_exten_visible', label: 'Directory ext visible', kind: 'bool', group: 'Directory' },
  { key: 'limit_max', label: 'Max calls', kind: 'number', group: 'Limits' },
  { key: 'limit_destination', label: 'Limit destination', kind: 'text', group: 'Limits' },
  { key: 'call_timeout', label: 'Call timeout (s)', kind: 'number', group: 'Call' },
  { key: 'call_group', label: 'Call group', kind: 'text', group: 'Call' },
  { key: 'call_screen_enabled', label: 'Call screening', kind: 'bool', group: 'Call' },
  { key: 'user_record', label: 'User record', kind: 'text', group: 'Call' },
  { key: 'hold_music', label: 'Hold music', kind: 'text', group: 'Call' },
  { key: 'toll_allow', label: 'Toll allow', kind: 'text', group: 'Call' },
  { key: 'context', label: 'Context', kind: 'text', group: 'Routing' },
  { key: 'auth_acl', label: 'Auth ACL', kind: 'text', group: 'Security' },
  { key: 'cidr', label: 'CIDR', kind: 'text', group: 'Security' },
  { key: 'sip_force_contact', label: 'SIP force contact', kind: 'text', group: 'SIP' },
  { key: 'sip_force_expires', label: 'SIP force expires', kind: 'text', group: 'SIP' },
  { key: 'mwi_account', label: 'MWI account', kind: 'text', group: 'SIP' },
  { key: 'sip_bypass_media', label: 'SIP bypass media', kind: 'text', group: 'SIP' },
  { key: 'forward_all_enabled', label: 'Fwd all', kind: 'bool', group: 'Forwarding' },
  { key: 'forward_all_destination', label: 'Fwd all dest', kind: 'text', group: 'Forwarding' },
  { key: 'forward_busy_enabled', label: 'Fwd busy', kind: 'bool', group: 'Forwarding' },
  { key: 'forward_busy_destination', label: 'Fwd busy dest', kind: 'text', group: 'Forwarding' },
  { key: 'forward_no_answer_enabled', label: 'Fwd no answer', kind: 'bool', group: 'Forwarding' },
  { key: 'forward_no_answer_destination', label: 'Fwd no answer dest', kind: 'text', group: 'Forwarding' },
  { key: 'follow_me_enabled', label: 'Follow me', kind: 'bool', group: 'Forwarding' },
  { key: 'do_not_disturb', label: 'Do not disturb', kind: 'bool', group: 'Forwarding' },
  { key: 'voicemail_enabled', label: 'Voicemail enabled', kind: 'bool', group: 'Voicemail' },
  { key: 'voicemail_password', label: 'Voicemail PIN', kind: 'password', group: 'Voicemail' },
  { key: 'voicemail_mail_to', label: 'VM email', kind: 'text', group: 'Voicemail' },
  { key: 'voicemail_attach_file', label: 'VM attach file', kind: 'bool', group: 'Voicemail' },
  { key: 'voicemail_local_after_email', label: 'Keep local after email', kind: 'bool', group: 'Voicemail' },
  { key: 'description', label: 'Description', kind: 'textarea', group: 'Notes' },
  { key: 'enabled', label: 'Enabled', kind: 'bool', group: 'Status' },
];

const ivr: FieldSpec[] = [
  { key: 'ivr_menu_name', label: 'Name', kind: 'text', group: 'Identity' },
  { key: 'ivr_menu_extension', label: 'Extension', kind: 'text', group: 'Identity' },
  { key: 'ivr_menu_greet_long', label: 'Greeting (long)', kind: 'text', group: 'Audio' },
  { key: 'ivr_menu_greet_short', label: 'Greeting (short)', kind: 'text', group: 'Audio' },
  { key: 'ivr_menu_invalid_sound', label: 'Invalid sound', kind: 'text', group: 'Audio' },
  { key: 'ivr_menu_exit_sound', label: 'Exit sound', kind: 'text', group: 'Audio' },
  { key: 'ivr_menu_confirm_macro', label: 'Confirm macro', kind: 'text', group: 'Behavior' },
  { key: 'ivr_menu_confirm_key', label: 'Confirm key', kind: 'text', group: 'Behavior' },
  { key: 'ivr_menu_tts_engine', label: 'TTS engine', kind: 'text', group: 'TTS' },
  { key: 'ivr_menu_tts_voice', label: 'TTS voice', kind: 'text', group: 'TTS' },
  { key: 'ivr_menu_confirm_attempts', label: 'Confirm attempts', kind: 'number', group: 'Behavior' },
  { key: 'ivr_menu_timeout', label: 'Timeout (ms)', kind: 'number', group: 'Behavior' },
  { key: 'ivr_menu_inter_digit_timeout', label: 'Inter-digit timeout (ms)', kind: 'number', group: 'Behavior' },
  { key: 'ivr_menu_max_failures', label: 'Max failures', kind: 'number', group: 'Behavior' },
  { key: 'ivr_menu_max_timeouts', label: 'Max timeouts', kind: 'number', group: 'Behavior' },
  { key: 'ivr_menu_digit_len', label: 'Digit length', kind: 'number', group: 'Behavior' },
  { key: 'ivr_menu_direct_dial', label: 'Direct dial', kind: 'bool', group: 'Behavior' },
  { key: 'ivr_menu_ringback', label: 'Ringback', kind: 'text', group: 'Behavior' },
  { key: 'ivr_menu_cid_prefix', label: 'CID prefix', kind: 'text', group: 'Behavior' },
  { key: 'ivr_menu_exit_app', label: 'Exit app', kind: 'text', group: 'Exit' },
  { key: 'ivr_menu_exit_data', label: 'Exit data', kind: 'text', group: 'Exit' },
  { key: 'ivr_menu_description', label: 'Description', kind: 'textarea', group: 'Notes' },
  { key: 'ivr_menu_enabled', label: 'Enabled', kind: 'bool', group: 'Status' },
];

const queue: FieldSpec[] = [
  { key: 'queue_name', label: 'Name', kind: 'text', group: 'Identity' },
  { key: 'queue_extension', label: 'Extension', kind: 'text', group: 'Identity' },
  { key: 'queue_strategy', label: 'Strategy', kind: 'text', group: 'Behavior' },
  { key: 'queue_moh_sound', label: 'MOH sound', kind: 'text', group: 'Audio' },
  { key: 'queue_record_template', label: 'Record template', kind: 'text', group: 'Recording' },
  { key: 'queue_time_base_score', label: 'Time base score', kind: 'text', group: 'Scoring' },
  { key: 'queue_max_wait_time', label: 'Max wait (s)', kind: 'number', group: 'Limits' },
  { key: 'queue_max_wait_time_with_no_agent', label: 'Max wait no agent (s)', kind: 'number', group: 'Limits' },
  { key: 'queue_max_wait_time_with_no_agent_time_reached', label: 'No-agent time reached (s)', kind: 'number', group: 'Limits' },
  { key: 'queue_tier_rules_apply', label: 'Tier rules apply', kind: 'bool', group: 'Tiers' },
  { key: 'queue_tier_rule_wait_second', label: 'Tier rule wait (s)', kind: 'number', group: 'Tiers' },
  { key: 'queue_tier_rule_wait_multiply_level', label: 'Tier rule multiply level', kind: 'bool', group: 'Tiers' },
  { key: 'queue_tier_rule_no_agent_no_wait', label: 'No agent no wait', kind: 'bool', group: 'Tiers' },
  { key: 'queue_discard_abandoned_after', label: 'Discard abandoned after (s)', kind: 'number', group: 'Limits' },
  { key: 'queue_abandoned_resume_allowed', label: 'Abandoned resume allowed', kind: 'bool', group: 'Behavior' },
  { key: 'queue_announce_sound', label: 'Announce sound', kind: 'text', group: 'Audio' },
  { key: 'queue_announce_frequency', label: 'Announce frequency', kind: 'number', group: 'Audio' },
  { key: 'queue_cid_name_prefix', label: 'CID name prefix', kind: 'text', group: 'Caller ID' },
  { key: 'queue_description', label: 'Description', kind: 'textarea', group: 'Notes' },
  { key: 'queue_enabled', label: 'Enabled', kind: 'bool', group: 'Status' },
];

const ringGroup: FieldSpec[] = [
  { key: 'ring_group_name', label: 'Name', kind: 'text', group: 'Identity' },
  { key: 'ring_group_extension', label: 'Extension', kind: 'text', group: 'Identity' },
  { key: 'ring_group_greeting', label: 'Greeting', kind: 'text', group: 'Audio' },
  { key: 'ring_group_strategy', label: 'Strategy', kind: 'text', group: 'Behavior' },
  { key: 'ring_group_timeout_app', label: 'Timeout app', kind: 'text', group: 'Timeout' },
  { key: 'ring_group_timeout_data', label: 'Timeout data', kind: 'text', group: 'Timeout' },
  { key: 'ring_group_call_timeout', label: 'Call timeout (s)', kind: 'number', group: 'Behavior' },
  { key: 'ring_group_caller_id_name', label: 'CID name', kind: 'text', group: 'Caller ID' },
  { key: 'ring_group_caller_id_number', label: 'CID number', kind: 'text', group: 'Caller ID' },
  { key: 'ring_group_cid_name_prefix', label: 'CID name prefix', kind: 'text', group: 'Caller ID' },
  { key: 'ring_group_cid_number_prefix', label: 'CID number prefix', kind: 'text', group: 'Caller ID' },
  { key: 'ring_group_distinctive_ring', label: 'Distinctive ring', kind: 'text', group: 'Behavior' },
  { key: 'ring_group_ringback', label: 'Ringback', kind: 'text', group: 'Behavior' },
  { key: 'ring_group_context', label: 'Context', kind: 'text', group: 'Routing' },
  { key: 'ring_group_forward_enabled', label: 'Forward enabled', kind: 'bool', group: 'Forward' },
  { key: 'ring_group_forward_destination', label: 'Forward destination', kind: 'text', group: 'Forward' },
  { key: 'ring_group_description', label: 'Description', kind: 'textarea', group: 'Notes' },
  { key: 'ring_group_enabled', label: 'Enabled', kind: 'bool', group: 'Status' },
];

const device: FieldSpec[] = [
  { key: 'device_mac_address', label: 'MAC address', kind: 'text', group: 'Identity' },
  { key: 'device_label', label: 'Label', kind: 'text', group: 'Identity' },
  { key: 'device_vendor', label: 'Vendor', kind: 'text', group: 'Hardware' },
  { key: 'device_model', label: 'Model', kind: 'text', group: 'Hardware' },
  { key: 'device_firmware_version', label: 'Firmware', kind: 'text', group: 'Hardware' },
  { key: 'device_template', label: 'Template', kind: 'text', group: 'Provisioning' },
  { key: 'device_profile_uuid', label: 'Device profile UUID', kind: 'text', group: 'Provisioning' },
  { key: 'device_user_uuid', label: 'User UUID (extension)', kind: 'text', group: 'Assignment' },
  { key: 'device_username', label: 'Username', kind: 'text', group: 'Auth' },
  { key: 'device_password', label: 'Password', kind: 'password', group: 'Auth' },
  { key: 'device_description', label: 'Description', kind: 'textarea', group: 'Notes' },
  { key: 'device_enabled', label: 'Enabled', kind: 'bool', group: 'Status' },
];

const destination: FieldSpec[] = [
  { key: 'destination_number', label: 'Number', kind: 'text', group: 'Identity' },
  { key: 'destination_number_regex', label: 'Number regex', kind: 'text', group: 'Identity' },
  { key: 'destination_prefix', label: 'Prefix', kind: 'text', group: 'Identity' },
  { key: 'destination_caller_id_name', label: 'CID name', kind: 'text', group: 'Caller ID' },
  { key: 'destination_caller_id_number', label: 'CID number', kind: 'text', group: 'Caller ID' },
  { key: 'destination_cid_name_prefix', label: 'CID name prefix', kind: 'text', group: 'Caller ID' },
  { key: 'destination_context', label: 'Context', kind: 'text', group: 'Routing' },
  { key: 'destination_type_voice', label: 'Voice', kind: 'bool', group: 'Type' },
  { key: 'destination_type_fax', label: 'Fax', kind: 'bool', group: 'Type' },
  { key: 'destination_type_text', label: 'Text', kind: 'bool', group: 'Type' },
  { key: 'destination_record', label: 'Record', kind: 'bool', group: 'Routing' },
  { key: 'destination_app', label: 'Action app', kind: 'text', group: 'Action' },
  { key: 'destination_data', label: 'Action data', kind: 'text', group: 'Action' },
  { key: 'destination_actions', label: 'Actions (JSON)', kind: 'textarea', group: 'Action' },
  { key: 'destination_alternate_app', label: 'Alternate app', kind: 'text', group: 'Action' },
  { key: 'destination_alternate_data', label: 'Alternate data', kind: 'text', group: 'Action' },
  { key: 'destination_description', label: 'Description', kind: 'textarea', group: 'Notes' },
  { key: 'destination_enabled', label: 'Enabled', kind: 'bool', group: 'Status' },
];

export const FUSIONPBX_FIELDS: Record<ResourceKind, FieldSpec[]> = {
  extension: ext,
  ivr,
  ivr_option: [
    { key: 'ivr_menu_option_digits', label: 'Digits', kind: 'text' },
    { key: 'ivr_menu_option_action', label: 'Action', kind: 'text' },
    { key: 'ivr_menu_option_param', label: 'Param', kind: 'text' },
    { key: 'ivr_menu_option_description', label: 'Description', kind: 'textarea' },
    { key: 'ivr_menu_option_order', label: 'Order', kind: 'number' },
    { key: 'ivr_menu_option_enabled', label: 'Enabled', kind: 'bool' },
  ],
  queue,
  ring_group: ringGroup,
  device,
  destination,
  voicemail: [
    { key: 'voicemail_id', label: 'Voicemail ID', kind: 'text' },
    { key: 'voicemail_password', label: 'PIN', kind: 'password' },
    { key: 'voicemail_mail_to', label: 'Email', kind: 'text' },
    { key: 'voicemail_attach_file', label: 'Attach file', kind: 'bool' },
    { key: 'voicemail_local_after_email', label: 'Keep local after email', kind: 'bool' },
    { key: 'voicemail_enabled', label: 'Enabled', kind: 'bool' },
  ],
};

export function getFields(kind: ResourceKind): FieldSpec[] {
  return FUSIONPBX_FIELDS[kind] || [];
}

/** Merge live row with field spec, returning entries in canonical order. */
export function mergedFields(kind: ResourceKind, row: Record<string, unknown>): Array<FieldSpec & { value: string }> {
  const spec = getFields(kind);
  const seen = new Set(spec.map((f) => f.key));
  const extras: FieldSpec[] = Object.keys(row || {})
    .filter((k) => !seen.has(k) && typeof (row as any)[k] !== 'object' && !k.endsWith('_uuid') && k !== 'domain_uuid' && k !== 'domain_name')
    .map((k) => ({ key: k, label: k.replace(/_/g, ' '), kind: 'text' as FieldKind, group: 'Other' }));
  return [...spec, ...extras].map((f) => {
    const raw = (row as any)?.[f.key];
    const value =
      raw === null || raw === undefined ? '' :
      raw === true || raw === 'true' ? 'true' :
      raw === false || raw === 'false' ? 'false' :
      String(raw);
    return { ...f, value };
  });
}
