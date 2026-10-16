# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration needs no account and holds no secret. It reads the location of
your house in Gladys (the `location` access), and sends EMSC only the centre
and radius of the zone, in the catch-up requests to `www.seismicportal.eu`. It
stores under `/data` the earthquakes of the zone over the last 7 days and a
hash of the zone, never the coordinates; its logs never contain them either.
Its only network traffic goes to `www.seismicportal.eu` (HTTPS and WebSocket).

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the EMSC services the integration reads.
