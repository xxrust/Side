import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodedImageSha256} from '../src/image.js';

const url=bytes=>'data:image/bmp;base64,'+Buffer.from(bytes).toString('base64');
const expected=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
test('exact encoded bytes share in-flight work; changed bytes never reuse a claimed identity',async()=>{
 const bytes=[66,77,1,2,3],source=url(bytes),one=encodedImageSha256(source);
 assert.equal(encodedImageSha256(source),one);
 assert.equal(await one,expected(bytes));
 assert.equal(await encodedImageSha256(url([...bytes,4])),expected([...bytes,4]));
 assert.notEqual(await encodedImageSha256(url([...bytes,4])),await one);
});
test('entry and byte budgets evict hashes; oversized inputs are never retained',async()=>{
 const first=url([66,77,10]),old=encodedImageSha256(first);await old;
 for(let i=11;i<16;i++)await encodedImageSha256(url([66,77,i]));
 assert.notEqual(encodedImageSha256(first),old);
 const a=url(Buffer.alloc(4*1024*1024,30)),b=url(Buffer.alloc(4*1024*1024,31));
 const before=encodedImageSha256(a);await before;await encodedImageSha256(b);
 assert.notEqual(encodedImageSha256(a),before,'combined retained strings exceed 16 MiB');
 const large=url(Buffer.alloc(7*1024*1024,40));
 assert.notEqual(encodedImageSha256(large),encodedImageSha256(large));
 await encodedImageSha256(large);
});
test('invalid data does not remain as a cached rejection',async()=>{
 const bad='data:image/bmp;base64,!';const failed=encodedImageSha256(bad);
 await assert.rejects(failed,/Base64/);
 const retry=encodedImageSha256(bad);assert.notEqual(retry,failed);await assert.rejects(retry,/Base64/);
});
