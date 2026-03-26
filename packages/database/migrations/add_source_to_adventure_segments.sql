-- Migration: Add source column to adventure_segments
-- Story 3.5: Strava Route Import as Segment
-- Run manually: psql $DATABASE_URL -f add_source_to_adventure_segments.sql

ALTER TABLE adventure_segments ADD COLUMN IF NOT EXISTS source TEXT;

-- source = null: manual GPX upload (existing rows)
-- source = 'strava': imported from Strava route
