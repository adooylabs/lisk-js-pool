# Lisk Pool

lisk-pool is an opensource consolidator - distributor based group pool for Lisk, it ships with no UI but will generate easy to use JSON files that you can use to build your own UI with.

This pool script is ideal if you would like to run a pool with your team. The basic workflow goes like this:

- Every member of your pool clones the repositor and would run the consolidator.js file
- This consolidator will share a percentage of your choice of your forging rewards and send it to a central distributor
- One member will run distributor.js next to his/her consolidator.js
- The distributor will receive all the funds from all the consolidators and distribute the funds amongst all voters

Supported configurations:

- Consolidator: Flat payouts to specific addresses
- Distributor: Distribute percentage of forged amount to voters
- Distributor: Distribute all received funds on an address to voters

## Installation

```
  git clone https://github.com/5an1ty/lisk-pool
  cd lisk-pool
  npm install
```

## Configuration

#### 1. Consolidator

Copy the file:
```
config.consolidator.sample.json
```
to:
```
config.consolidator.json
```

and edit accordingly:

```
{
  "node": "", // The node you would like to connect to, it can be your own node but also a public one
  "port": null, // The port that the node runs on
  "delegate": "", // Your delegate name
  "secret1": "", // Your delegate first secret
  "secret2": null, // Your delegate second secret
  "targetAddresses": [
    { "address": "", "percentage": 40, "payfee": true },
    { "address": "", "amount": 200, "payfee": true }
  ], // Array of addresses to pay out to with a percentage or amount in lisk to pay out. The payfee flag determines if you pay the fee or if it is deducted from the amount to pay.
  "schedule": "0 9 * * 6", // Time when this script would do it's payouts in a cron format (https://crontab.guru/)
  "minPayout": 1 // The minimum amount earned in LSK before a payout would happen
}
```

#### 2. Distributor

Copy the file:
```
config.distributor.sample.json
```
to:
```
config.distributor.json
```

and edit accordingly

```
{
  "node": "", // The node you would like to connect to, it can be your own node but also a public one
  "port": null, // The port that the node runs on
  "address": "", // the address of the distributor
  "secret1": "", // The secret of the distributor account
  "secret2": null, // The second secret of the distributor account
  "mode": "forged", // choice of mode (between received and forged). Forged is distrubute a percentage of what you have forged to your voters and received is distribute whatever amount you receive on this address
  "percentage": 100, // If you select forged mode, this is percentage of what you forge that you would like to share
  "requiredVotes": [], // The names of delegates that are required before a voter would be considered valid
  "optionalVotes": [], // The names of optional delegates that would increase a voters virtual weigth (and thus payout) by X
  "optionalIncreasePercentage": 5, // The percentage per optional delegate that a voters virtual weigth (and thus payout) would be increased
  "schedule": "0 9 * * 6", // Time when this script would do it's payouts in a cron format (https://crontab.guru/)
  "minPayout": 1 // The minimum amount earned in LSK before a payout would happen
}
```

## Running lisk-pool

#### 1. Consolidator

```
node consolidator.js
```

#### 2. Distributor

```
node distributor.js
```

#### 3. PM2

In order to make sure your pool scripts forever i would suggest running them via PM2

Example for consolidator:

```
pm2 start consolidator.js
```

More can be read about PM2 on their [official documentation](http://pm2.keymetrics.io/docs/usage/quick-start/)

## Ignoring the schedule

You can run both consolidator.js and distributor.js with the switch --once which will cause it to ignore it's schedule and run immediately.
In addition you can add the --dryrun parameter to test your configuration. (it will not send transactions nor save the balance to disk)
Example:

```
node consolidator.js --once
```

```
node consolidator.js --once --dryrun
```

## Output

Both scripts will generate output in json files after they are done running (consolidated.json and distributed.json).
These files can be used as a basis for your UI.

## License

Copyright © 2017-2018 Ruben Callewaert

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the [GNU General Public License](https://github.com/5an1ty/lisk-pool/tree/master/LICENSE) along with this program.  If not, see <http://www.gnu.org/licenses/>.