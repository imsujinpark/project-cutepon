// This is required for stack traces to refer to the original typescript code instead of the compiled js
import { install as soure_map_support } from 'source-map-support';
soure_map_support();

import { User } from './src/User.js';
import { Coupon, CouponStatus } from './src/Coupon.js';
import { Database, Statement } from './src/sqlite-async.js';
import { Tester } from './src/tester.js';
import fs from 'fs';
import * as util from "./src/util.js";

async function main () {
    
    await new Tester(
        "User tests",
        async function on_start(t) {
            // Always run the tests on a test database that has been reset already
            const db = await Database.open("./data/test_db.db");
            t.log("opened " + db.filename);
            await User.reset_table(db);
            await Coupon.reset_table(db);
            await User.initialize_statements(db);
            await Coupon.initialize_statements(db);
            return {db};
        },
        async function on_end(t, udata) {
            t.log("closing " + udata.db.filename);
            await User.close();
            await Coupon.close();
            await (udata.db as Database).close();
        },
        async function tests(t:Tester, udata) {

            await t.test("reset table user", async () => {

                // Create an in memory sqlite database to not modify the original
                const db = await Database.open(':memory:');
                await User.reset_table(db);
                
                // The table should exists
                let statement:Statement = await db.prepare(`
                    SELECT name FROM sqlite_master WHERE type = ? AND name = ?
                `);
                let row = await statement.get(`table`, `user`);
                t.expect(row !== null);
                t.expect(row.name === `user`);
                await statement.finalize();
                
                // There should be no users
                let statement2 = await db.prepare(`
                    SELECT * FROM user
                `);
                let row2 = await statement2.get();
                t.expect(!row2);
                await statement2.finalize();

                await db.close();

            });

            await t.test("create user", async () => {
                let newUser = await User.create_new_user("some-unique-id", "nickname");
                let existing_user_unique_id = await User.get_existing_user_unique("some-unique-id");
                
                t.expect(newUser.internal_id === existing_user_unique_id?.internal_id);
                t.expect(newUser.public_id === existing_user_unique_id?.public_id);
                t.expect(newUser.unique_id === existing_user_unique_id?.unique_id);

                let existing_user_internal_id = await User.get_existing_user_internal(newUser.internal_id);

                t.expect(newUser.internal_id === existing_user_internal_id?.internal_id);
                t.expect(newUser.public_id === existing_user_internal_id?.public_id);
                t.expect(newUser.unique_id === existing_user_internal_id?.unique_id);

                let existing_user_public_id = await User.get_existing_user_public("nickname");

                t.expect(newUser.internal_id === existing_user_public_id?.internal_id);
                t.expect(newUser.public_id === existing_user_public_id?.public_id);
                t.expect(newUser.unique_id === existing_user_public_id?.unique_id);

            });

            await t.test("non existing user", async () => {
                let existingUser = await User.get_existing_user_unique("non-existing-user");
                t.expect(existingUser === null);
            });
            
            await t.test("fail on duplication of unique ids", async () => {
                
                await User.create_new_user("same-id", "doesntmatter");
                
                await t.expect_throw(
                    async () => {
                        await User.create_new_user("same-id", "doesntmatter")
                    },
                    (e) => {
                        t.expect(e.message === "SQLITE_CONSTRAINT: UNIQUE constraint failed: user.unique_id");
                    }
                );

            });

            await t.test("this test will fail on purpose!", async () => {
            
                await t.expect_throw(
                    async () => {
                        /** I do nothing */
                    },
                    (err) => {
                        t.log("I shouldn't be here!");
                        throw new Error("I shouldn't be here!");
                    }
                );

            });


            await t.test("test functions that expect throwing", async () => {

                await t.expect_throw(
                    async () => {
                        throw "hello!";
                    },
                    (err) => {
                        t.expect(err === "hello!");
                    }
                );

                await t.expect_throw(
                    async () => {
                        throw new Error("hello!");
                    },
                    (err) => {
                        t.expect((err as Error).message  === "hello!");
                    }
                );

            });

            // Skip this test since typescript's type system will be the one stopping me from making this mistake
            /*
            await t.test("user cant have nulls", async () => {
                
                await t.expect_throw(
                    async () => { await User.create_new_user(null , null) } ,
                    (e) => t.expect(e.message === "constraint failed")
                );

                await t.expect_throw(
                    async () => { await User.create_new_user("user_not_null", null) } ,
                    (e) => t.expect(e.message === "constraint failed")
                );

                await t.expect_throw(
                    async () => { await User.create_new_user(null, "public name") } ,
                    (e) => t.expect(e.message === "constraint failed")
                );

            });
            */

            await t.test("user is read only", async () => {
                
                let unique_id = "user_read_only_test";
                await User.create_new_user(unique_id, "doesntmatter");

                await t.expect_throw(
                    async () => {
                        await udata.db.run(`update user set public_id = ? where unique_id = ?`, `new_name`, unique_id)
                    },
                    (e) => {
                        t.expect(e.message === "SQLITE_CONSTRAINT: user is readonly!")
                    }
                );

                await t.expect_throw(
                    async () => {
                        await udata.db.run(`update user set unique_id = ? where unique_id = ?`, `new_id`, unique_id)
                    },
                    (e) => {
                        t.expect(e.message === "SQLITE_CONSTRAINT: user is readonly!")
                    }
                );

                await t.expect_throw(
                    async () => {
                        await udata.db.run(`update user set internal_id = ? where unique_id = ?`, 300, unique_id)
                    },
                    (e) => {
                        t.expect(e.message === "SQLITE_CONSTRAINT: user is readonly!")
                    }
                );
            });
        }
    ).run();

    await new Tester(
        "Coupon tests",
        async function on_start(t) {
            // Always run the tests on a test database that has been reset already
            const db = await Database.open("./data/test_coupon.db");
            t.log("opened " + db.filename);
            await User.reset_table(db);
            await User.initialize_statements(db);
            await Coupon.reset_table(db);
            await Coupon.initialize_statements(db);
            return {db};
        },
        async function on_end(t, udata) {
            t.log("closing " + udata.db.filename);
            await User.close();
            await Coupon.close();
            await (udata.db as Database).close();
        },
        async function tests(t:Tester, udata) {

            await t.test("reset table coupon", async () => {

                // Create an in memory sqlite database to not modify the original
                const db = await Database.open(":memory:");
                await Coupon.reset_table(db);
                
                // debug with select name, type from sqlite_master;
                // The table should exists
                let statement = await db.prepare(`select name from sqlite_master where type=? AND name=?`);
                let row = await statement.get(`table`, `coupon`);
                t.expect(row);
                t.expect(row.name === `coupon`);
                await statement.finalize();
                
                // There should be no users
                let statement2 = await db.prepare(`SELECT * FROM coupon`);
                let row2 = await statement2.get();
                t.expect(!row2);
                await statement2.finalize();

            });

            await t.test("Create coupon", async () => {

                const usera = await User.create_new_user("usera1", "Paco");
                const userb = await User.create_new_user("userb1", "Pepe");

                const title = "Super coupon!";
                const description = "Redeem this coupon for a mistery gift!";
                const expiration_date = new Date("July 4 2034 12:30");
                const coupon = await Coupon.create_new_coupon(
                    title, description, expiration_date,
                    /* A sends a coupon to B */
                    usera, userb
                );

                t.expect(coupon.description === description);
                t.expect(coupon.expiration_date.getTime() === expiration_date.getTime());
                t.expect(coupon.title === title);
                t.expect(coupon.origin_user.internal_id === usera.internal_id);
                t.expect(coupon.target_user.internal_id === userb.internal_id);
                t.expect(coupon.created_date && coupon.created_date.getTime() !== 0);
                t.expect(coupon.finish_date === null); // since it defaults to null
                t.expect(typeof coupon.id === 'number');
                t.expect(coupon.id >= 0);
                t.expect(coupon.status === CouponStatus.Active);

                // I call it primitve cause it uses primitive types, but its basically the
                // "public view" of the coupon object
                const coupon_primitive = coupon.primitive();

                t.expect(coupon_primitive.title === title);
                t.expect(coupon_primitive.description === description);
                t.expect(coupon_primitive.expiration_date === expiration_date.getTime());
                t.expect(coupon_primitive.origin_user === usera.public_id);
                t.expect(coupon_primitive.target_user === userb.public_id);
                t.expect(coupon_primitive.created_date === coupon.created_date.getTime());
                t.expect(coupon_primitive.finish_date === null); // since it defaults to null
                t.expect(coupon_primitive.id === coupon.id);
                t.expect(coupon_primitive.status === CouponStatus.Active);

            });

            await t.test("Send coupon", async () => {
                const sender = await User.create_new_user("sender1", "some@email.com");
                const receiver = await User.create_new_user("receiver1", "some_different@email.com");

                const expiration = new Date("July 4 2034 12:30").getTime();
                const target_user = receiver.public_id;
                const title = "coupon"
                const description = "description"
                
                const user: User = await User.get_existing_user_internal(sender.internal_id) ?? util.unreachable();
                const target: User = await User.get_existing_user_public(target_user) ?? util.unreachable(); 
                const expiration_date = expiration ? new Date(expiration) : new Date(Date.now() + util.day_in_ms * 30)
                const coupon = await Coupon.create_new_coupon(
                    title ?? "Coupon",
                    description ?? "",
                    expiration_date,
                    user,
                    target
                );
                const coupon_primitive = coupon.primitive();
                t.expect_equal(coupon_primitive.title, coupon.title);
                t.expect_equal(coupon_primitive.description, coupon.description);
                t.expect_equal(coupon_primitive.expiration_date, coupon.expiration_date.getTime());
                t.expect_equal(coupon_primitive.origin_user, coupon.origin_user.public_id);
                t.expect_equal(coupon_primitive.target_user, coupon.target_user.public_id);
                t.expect_equal(coupon_primitive.created_date, coupon.created_date.getTime());
                t.expect_equal(coupon_primitive.finish_date, null);
                t.expect_equal(coupon_primitive.id, coupon.id);
                t.expect_equal(coupon_primitive.status, coupon.status);
            });


            await t.test("A sends coupon to B", async () => {

                const usera = await User.create_new_user("usera2", "Paco");
                const userb = await User.create_new_user("userb2", "Pepe");

                const coupon = await Coupon.create_new_coupon("Name of coupon~",
                    "Redeem this coupon for a mistery gift!",
                    new Date("July 4 2034 12:30"),
                    /* A sends a coupon to B */
                    usera, userb
                );

                const usera_available_coupons = await Coupon.get_available(usera);
                t.expect(usera_available_coupons.length === 0);
                
                const userb_available_coupons = await Coupon.get_available(userb);
                t.expect(userb_available_coupons.length === 1);

            });

            await t.test("A uses coupon from B", async () => {

                const usera = await User.create_new_user("usera3", "Paco1");
                const userb = await User.create_new_user("userb3", "Pepe1");

                const coupon = await Coupon.create_new_coupon(
                    "Name of coupon~",
                    "Redeem this coupon for a mistery gift!",
                    // this test should fail on July 4 2034 12:30 lol
                    new Date("July 4 2034 12:30"),
                    /* A sends a coupon to B */
                    usera, userb
                );
                t.expect(coupon.status === CouponStatus.Active);

                const now = new Date().getTime();
                const updated_coupon = await Coupon.redeem(coupon);
                
                // They are the same coupon, but not equal, since status and finish_date have changed
                const same1 = Coupon.same(coupon, updated_coupon);
                const equal1 = Coupon.equal(coupon, updated_coupon);
                t.expect(same1.isSame, same1.different);
                t.expect(!equal1.isEqual, equal1.different);
                
                // status was updated
                t.expect(updated_coupon.status === CouponStatus.Redeemed);

                // used in between now-5ms and now+5ms
                if (!updated_coupon.finish_date) throw new Error("Finish date is null even tho it was just redeemed")
                const used = updated_coupon.finish_date.getTime();
                // Its pretty high but the reason for that is not that its slow, but rather that the timestamps are 
                // stored in seconds precision
                const margin_ms = 2 * 1000;
                t.expect(used > now-margin_ms && used < now+margin_ms)

                // The coupon in database should be the same as the coupon received after redeeming it
                const coupon_in_db = await Coupon.get(coupon.id);
                const same2 = Coupon.same(coupon_in_db, updated_coupon)
                const equal2 = Coupon.equal(coupon_in_db, updated_coupon)
                t.expect(same2.isSame, same2.different);
                t.expect(equal2.isEqual, equal2.different);

            });

        }
    ).run();

    await new Tester(
        "Tests SQLite", null, null, async (t) => {

            await t.test("As long as statements are reset or finalized, changes are commited", async () => {

                { // Start with an empty db
                    let db:Database = await Database.open('./data/dbtest.sqlite3');
                    await User.reset_table(db);
                    await db.close();
                }

                // Open the database, which is empty, and add a user
                const same_db_1 = await Database.open('./data/dbtest.sqlite3') as Database;
                await User.initialize_statements(same_db_1);
                const user = await User.create_new_user("Pepe", "xXx_Pepe_xXx");

                // Without closing the connection, open a new one and see if the data has been commited
                const same_db_2 = await Database.open('./data/dbtest.sqlite3') as Database;
                await User.initialize_statements(same_db_2);
                const same_user = await User.get_existing_user_internal(user.internal_id);
                t.expect(same_user !== null);
                t.expect(user.internal_id === same_user?.internal_id);

            });

            await t.test("Not resetting or finalizing a statement means that changes are not commited", async () => {

                { // Start with an empty db
                    let db:Database = await Database.open('./data/dbtest.sqlite3');
                    await User.reset_table(db);
                    await db.close();
                }

                // Open the database, which is empty, and add a user
                const same_db_1 = await Database.open('./data/dbtest.sqlite3') as Database;
                await User.initialize_statements(same_db_1);
                const statement: Statement = await same_db_1.prepare('insert into user (unique_id, public_id) values (?, ?) returning internal_id');
                const user = await statement.get("abc", "def");

                // Without closing the connection, open a new one and see if the data has been commited
                const same_db_2 = await Database.open('./data/dbtest.sqlite3') as Database;
                await User.initialize_statements(same_db_2);
                const same_user = await User.get_existing_user_internal(user.internal_id);
                t.expect(same_user === null);

                await t.expect_throw(
                    async () => {
                        // This will fail cause the database still has an open statement
                        await User.reset_table(same_db_1);
                    },
                    (err) => {
                        t.expect(err.message === 'SQLITE_LOCKED: database table is locked');
                    }
                );

                await statement.finalize();
                // This wont throw this time tho cause we just closed the statement
                await User.reset_table(same_db_1);
                t.expect(true);
            });

            await t.test("Resetting or finalizing a statement means that changes are not commited", async () => {

                { // Start with an empty db
                    let db:Database = await Database.open('./data/dbtest.sqlite3');
                    await User.reset_table(db);
                    await db.close();
                }
                
                // Open the database, which is empty, and add a user
                const same_db_1 = await Database.open('./data/dbtest.sqlite3') as Database;
                await User.initialize_statements(same_db_1);
                const statement: Statement = await same_db_1.prepare('insert into user (unique_id, public_id) values (?, ?) returning internal_id');
                const row = await statement.get("abc", "def");
                const user_internal_id = row.internal_id;
                await statement.finalize();

                // Without closing the connection, open a new one and see if the data has been commited
                const same_db_2 = await Database.open('./data/dbtest.sqlite3') as Database;
                await User.initialize_statements(same_db_2);
                const same_user = await User.get_existing_user_internal(user_internal_id);
                t.expect(same_user !== null);
                t.expect(user_internal_id === same_user?.internal_id);

            });

        }
    ).run();
    
}

main();