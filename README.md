# `up`

Currently in the process of configuring my home ISP: This is a small tool intended to help monitor uptime after switching from a "Big Tech" ISP to a smaller lesser known ISP. At the moment, it simply pings google.com, github.com and Cloudflare's public DNS resolver and measures response latency and writes it to SQLite. In addition, it runs a "speed test" once each hour and writes the result to SQLite.

The "Big Tech" ISP would proactively issue credits for downtime even in cases where the outage isn't noticed. It's not clear whether the mystery ISP will do the same. This is easily runnable on a small Raspberry Pi.

## Prerequisites

- go
- npm

# Build

```
make run
```