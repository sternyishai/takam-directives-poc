# "In force" is computed from the validity dates, not the API's `isvalid` flag

The API field `isvalid` is inverted: on 2026-11-23 it was `true` for exactly the 53 documents whose `datevalidto` had passed and `false` for the 1,073 in force. The site's own detail panel ("בתוקף: לא") agrees with the dates, not with the field name. We compute In force as `datevalidfrom ≤ today ≤ datevalidto` (open-ended when `datevalidto` is null, inclusive), so a future fix to the flag cannot silently flip every badge.
