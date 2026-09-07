"""Offline adapter regression checks: no credentials and no network."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('h3client', Path(__file__).with_name('compshare-h3.py'))
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class OfflineTests(unittest.TestCase):
    def test_duration_boundaries(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'prompt.md').write_text('\n'.join(x + '\nExample.' for x in client.REF2VA_FIELDS), encoding='utf-8')
            (root / 'ref.png').write_bytes(b'offline-fixture')
            for duration in [4, 15, 16, 30, 31, 3, True, 15.5]:
                job = {'promptFile': 'prompt.md', 'duration': duration, 'resolution': '768P', 'ratio': '16:9', 'referenceImages': [{'path': 'ref.png', 'role': 'reference_image'}], 'output': 'video.mp4'}
                file = root / 'job.json'
                file.write_text(json.dumps(job), encoding='utf-8')
                if type(duration) is int and 4 <= duration <= 30:
                    resolved, _, _ = client.resolve_job(file)
                    self.assertEqual(resolved['duration'], duration)
                else:
                    with self.assertRaisesRegex(client.H3Error, 'duration'):
                        client.resolve_job(file)

    def test_audit_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            file = root / 'audit.json'
            file.write_bytes(b'approved fixture')
            job = {'realityAudit': {'path': 'audit.json', 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}}
            client.check_reality_snapshot(job, root)
            file.write_bytes(b'changed')
            with self.assertRaises(client.H3Error): client.check_reality_snapshot(job, root)
            file.unlink()
            with self.assertRaises(client.H3Error): client.check_reality_snapshot(job, root)

    def test_legacy_submission_stops_before_network(self):
        args = argparse.Namespace(job=Path('job.json'), dry_run=False, confirm_submit='J1', state=None)
        with patch.object(client, 'resolve_job', return_value=({'sourceStatus':'approved','costApproved':True}, 'prompt', Path('video.mp4'))), patch.object(client, 'build_payload', return_value={}), patch.object(client, 'request_json', side_effect=AssertionError('NETWORK FORBIDDEN')) as network:
            with self.assertRaisesRegex(client.H3Error, 'Legacy export'): client.cmd_submit(args)
            network.assert_not_called()


if __name__ == '__main__': unittest.main()
