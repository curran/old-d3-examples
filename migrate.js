// https://github.com/octokit/octokit.js
import { Octokit } from 'octokit';

// https://nodejs.org/api/child_process.html#child_processexeccommand-options-callback
import { exec } from 'node:child_process';

// https://www.kindacode.com/article/node-js-ways-to-create-a-directory-if-it-doesnt-exist/
import fs from 'fs';

import { users } from './users.js';

// The interval of possible random wait times (ms) between clones.
// This is done to avoid triggering rate limits with GitHub.
const minWait = 2000;
const maxWait = 5000;

// Wait between Octokit requests
const waitBetweenRequests = 200;

// import users from 'users-combined.csv';
//const users = [{ username: 'mbostock' }];

//const octokit = new Octokit({ auth: `personal-access-token123` });
const octokit = new Octokit({
  auth: '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',
});

// Periodically report rate limit status
const checkRateLimit = async () => {
  const rateLimitResult = await octokit.request('GET /rate_limit', {});
  console.log('\n\nGitHub API rate limit status:');
  console.log(rateLimitResult.data.rate);
  console.log('\n\n');
};
checkRateLimit();
const every5Minutes = 1000 * 60 * 5;
setInterval(checkRateLimit, every5Minutes);

// Creates the given directory if it doesn't already exist
const make = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
};

// Takes Gists to disk!
const migrate = async () => {
  make('./gists');
  for (const user of users) {
    console.log('Migrating Gists from user ' + user.username);
    // is you're using CommonJS, use the line below:
    // const fs = require('fs');
    const { username } = user;
    const cwd = `./gists/${username}`;
    make(cwd);
    const alreadyClonedGistCount = fs.readdirSync(cwd).length;

    try {
      // Save user metadata
      const userData = await octokit.request('GET /users/{username}', user);
      make('./users');
      fs.writeFileSync(
        `./users/${user.username}.json`,
        JSON.stringify(userData)
      );

      // If we've already cloned all these gists,
      // which we can infer by counting the number of files,
      // then let's skip this user!
      if (userData.data.public_gists === alreadyClonedGistCount) {
        console.log(
          'Skipping user ' + user.username + ' as gists are already cloned'
        );
        continue;
      }

      // https://octokit.github.io/rest.js/v19#gists-list-for-user
      const iterator = octokit.paginate.iterator(
        octokit.rest.gists.listForUser,
        {
          username,
          per_page: 100,
        }
      );

      // Problem: When the script is restarted,
      // it takes a long time to figure out who's gists are already cloned.
      // Solution: A faster way to check if all gists from a given user
      // are already cloned; just count the directories and compare that
      // against the total number of gists.

      let gists = [];

      // iterate through the entire iterator to get
      // the full list if gists into memory,
      // so that we can get its count.
      for await (const result of iterator) {
        console.log(
          '\nProcessing a page of Gists with ' + result.data.length + '...'
        );
        gists = [...gists, ...result.data];
        //// Wait between pages, just in case
        //console.log(
        //  `Waiting ${
        //    waitBetweenRequests / 1000
        //  } seconds to fetch next page of Gists`
        //);
        //await new Promise((resolve) =>
        //  setTimeout(resolve, waitBetweenRequests)
        //);
      }
      console.log(
        'There are ' + gists.length + ' gists for user ' + user.username
      );

      for (const gist of gists) {
        if (fs.existsSync(`${cwd}/${gist.id}`)) {
          console.log(
            `Skipping already cloned gist ${user.username}/${gist.id}`
          );
          continue;
        }
        console.log(`Cloning gist ${user.username}/${gist.id}`);
        const command = `git clone ${gist.git_pull_url}`;

        exec(command, { cwd });
        // Example value for gist:
        //	    {
        //  "url": "https://api.github.com/gists/a6c261aca1a12452111cb1b797c04d70",
        //  "forks_url": "https://api.github.com/gists/a6c261aca1a12452111cb1b797c04d70/forks",
        //  "commits_url": "https://api.github.com/gists/a6c261aca1a12452111cb1b797c04d70/commits",
        //  "id": "a6c261aca1a12452111cb1b797c04d70",
        //  "node_id": "G_kwDOAAELQNoAIGE2YzI2MWFjYTFhMTI0NTIxMTFjYjFiNzk3YzA0ZDcw",
        //  "git_pull_url": "https://gist.github.com/a6c261aca1a12452111cb1b797c04d70.git",
        //  "git_push_url": "https://gist.github.com/a6c261aca1a12452111cb1b797c04d70.git",
        //  "html_url": "https://gist.github.com/a6c261aca1a12452111cb1b797c04d70",
        //  "files": {
        //    "App.js": {
        //      "filename": "App.js",
        //      "type": "application/javascript",
        //      "language": "JavaScript",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/60cfbd370a5c27328388658b0eb3213d29916959/App.js",
        //      "size": 268
        //    },
        //    "README.md": {
        //      "filename": "README.md",
        //      "type": "text/markdown",
        //      "language": "Markdown",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/4e8976a0ce82ac714e8fb3cd6e62856d4d604a26/README.md",
        //      "size": 480
        //    },
        //    "VizWrapper.js": {
        //      "filename": "VizWrapper.js",
        //      "type": "application/javascript",
        //      "language": "JavaScript",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/5be24f7c071521d6664cd4f5824ebf33bf8973e3/VizWrapper.js",
        //      "size": 645
        //    },
        //    "axes.js": {
        //      "filename": "axes.js",
        //      "type": "application/javascript",
        //      "language": "JavaScript",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/d9b568c0d3c689f5636253cb02e1c19cc7cbcec7/axes.js",
        //      "size": 558
        //    },
        //    "bundle.js": {
        //      "filename": "bundle.js",
        //      "type": "application/javascript",
        //      "language": "JavaScript",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/439597339531b97d0d63b18c6f7be81c77a204b1/bundle.js",
        //      "size": 11839
        //    },
        //    "data.csv": {
        //      "filename": "data.csv",
        //      "type": "text/csv",
        //      "language": "CSV",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/381891c6c8df91beae9ab4e768dcce842f107520/data.csv",
        //      "size": 3857
        //    },
        //    "index.html": {
        //      "filename": "index.html",
        //      "type": "text/html",
        //      "language": "HTML",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/23e22fc3d4f471c026b97db75840e3836b93dd65/index.html",
        //      "size": 449
        //    },
        //    "index.js": {
        //      "filename": "index.js",
        //      "type": "application/javascript",
        //      "language": "JavaScript",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/ebc1e332e2bcff91dde9bf629455dff19715b6c7/index.js",
        //      "size": 143
        //    },
        //    "package.json": {
        //      "filename": "package.json",
        //      "type": "application/json",
        //      "language": "JSON",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/75ac131fe8ff991dfcecbfdaf0ad67d459e0be2b/package.json",
        //      "size": 136
        //    },
        //    "rollup.config.js": {
        //      "filename": "rollup.config.js",
        //      "type": "application/javascript",
        //      "language": "JavaScript",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/381d2c316f87c64b693fc54b3815894dd106ab81/rollup.config.js",
        //      "size": 297
        //    },
        //    "styles.css": {
        //      "filename": "styles.css",
        //      "type": "text/css",
        //      "language": "CSS",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/33f16fa4050efcdc2b87120226573199ba5ab16d/styles.css",
        //      "size": 97
        //    },
        //    "useData.js": {
        //      "filename": "useData.js",
        //      "type": "application/javascript",
        //      "language": "JavaScript",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/34e195b15138a6610dcf33e5547f0e63e9071ee8/useData.js",
        //      "size": 439
        //    },
        //    "viz.js": {
        //      "filename": "viz.js",
        //      "type": "application/javascript",
        //      "language": "JavaScript",
        //      "raw_url": "https://gist.githubusercontent.com/curran/a6c261aca1a12452111cb1b797c04d70/raw/a60db6dc1e02f62e445c107ca295e7623347fd14/viz.js",
        //      "size": 757
        //    }
        //  },
        //  "public": true,
        //  "created_at": "2022-06-05T13:33:26Z",
        //  "updated_at": "2022-06-05T13:36:47Z",
        //  "description": " React & D3 Starter",
        //  "comments": 0,
        //  "user": null,
        //  "comments_url": "https://api.github.com/gists/a6c261aca1a12452111cb1b797c04d70/comments",
        //  "owner": {
        //    "login": "curran",
        //    "id": 68416,
        //    "node_id": "MDQ6VXNlcjY4NDE2",
        //    "avatar_url": "https://avatars.githubusercontent.com/u/68416?v=4",
        //    "gravatar_id": "",
        //    "url": "https://api.github.com/users/curran",
        //    "html_url": "https://github.com/curran",
        //    "followers_url": "https://api.github.com/users/curran/followers",
        //    "following_url": "https://api.github.com/users/curran/following{/other_user}",
        //    "gists_url": "https://api.github.com/users/curran/gists{/gist_id}",
        //    "starred_url": "https://api.github.com/users/curran/starred{/owner}{/repo}",
        //    "subscriptions_url": "https://api.github.com/users/curran/subscriptions",
        //    "organizations_url": "https://api.github.com/users/curran/orgs",
        //    "repos_url": "https://api.github.com/users/curran/repos",
        //    "events_url": "https://api.github.com/users/curran/events{/privacy}",
        //    "received_events_url": "https://api.github.com/users/curran/received_events",
        //    "type": "User",
        //    "site_admin": false
        //  },
        //  "truncated": false
        //}

        const wait = minWait + (maxWait - minWait) * Math.random();
        console.log(`Waiting ${Math.round(wait / 1000)} seconds to next clone`);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    } catch (error) {
      if (error.status === 404) {
        console.log(`\n\n  Invalid user ${user.username}. Moving on...\n\n`);
      } else {
        console.log(error);
      }
    }
  }
};

migrate();
