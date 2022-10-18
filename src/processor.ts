import {BatchContext, BatchProcessorItem, SubstrateBatchProcessor} from "@subsquid/substrate-processor"
import {Store, TypeormDatabase} from "@subsquid/typeorm-store"
import {Transfer} from "./model"
import {BalancesTransferEvent} from "./types/events"


const processor = new SubstrateBatchProcessor()
    .setBatchSize(500)
    .setDataSource({
        // Use archive created by archive/docker-compose.yml
        archive: 'http://localhost:8888/graphql'
    })
    .addEvent('Balances.Transfer', {
        data: {
            event: {
                args: true,
                extrinsic: {
                    id: true,
                    from: true,
                    to: true,
                    amount: true,
                    fee: true
                }
            }
        }
    } as const)


type Item = BatchProcessorItem<typeof processor>
type Ctx = BatchContext<Store, Item>


processor.run(new TypeormDatabase(), async ctx => {
    let transfersData = getTransfers(ctx)

    let transfers: Transfer[] = []

    for (let t of transfersData) {
        let { id, amount } = t

        let from = t.from
        let to = t.to

        transfers.push(new Transfer({
            id,
            from,
            to,
            amount,
            assetId
        }))
    }

    // await ctx.store.save(Array.from(accounts.values()))
    await ctx.store.insert(transfers)
})


interface TransferEvent {
    id: string
    from: string
    to: string
    amount: string
    assetId: string
}

function getTransfers(ctx: Ctx): TransferEvent[] {
    let transfers: TransferEvent[] = []
    for (let block of ctx.blocks) {
        for (let item of block.items) {
            if (item.name == "Balances.Transfer") {
                let e = new BalancesTransferEvent(ctx, item.event)
                let rec: {from: string, to: string, amount: bigint}
                if (e.isV1020) {
                    let [from, to, amount,] = e.asV1020
                    rec = {from, to, amount}
                } else if (e.isV1050) {
                    let [from, to, amount] = e.asV1050
                    rec = {from, to, amount}
                } else {
                    rec = e.asV9130
                }
                transfers.push({
                    id: item.event.id,
                    from: rec.from,
                    to: rec.to,
                    amount: rec.amount
                })
            }
        }
    }
    return transfers
}
