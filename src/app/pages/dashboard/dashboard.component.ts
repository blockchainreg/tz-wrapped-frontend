import { Component, EventEmitter, Input, OnInit } from '@angular/core'
import { Store } from '@ngrx/store'
import * as fromRoot from '../../reducers/index'
import * as actions from '../../app.actions'
import { FormControl, Validators } from '@angular/forms'
import { BeaconService } from '../../services/beacon/beacon.service'
import {
  Contract,
  OperationRequest,
  User,
  OperationRequestKind,
  OperationRequestState,
  UserKind,
} from 'src/app/services/api/api.service'
import { Observable } from 'rxjs'
import BigNumber from 'bignumber.js'
import { filter, map, switchMap, take } from 'rxjs/operators'

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  @Input() buttonLabel: string | undefined

  public selectedTab: 'tab0' | 'tab1' | 'tab2' = 'tab0' // Rename to "tab-mint", etc.

  receivingAddressControl: FormControl
  amountTransferControl: FormControl
  amountControl: FormControl
  dataEmitter: EventEmitter<any[]> = new EventEmitter<any[]>()
  public address$: Observable<string | null>
  public openMintOperationRequests$: Observable<OperationRequest[]>
  public approvedMintOperationRequests$: Observable<OperationRequest[]>
  public openBurnRequests$: Observable<OperationRequest[]>
  public approvedBurnRequests$: Observable<OperationRequest[]>
  public users$: Observable<User[]>
  public keyholders$: Observable<User[]>
  public mintOperationRequests$: Observable<OperationRequest[]>
  public burnOperationRequests$: Observable<OperationRequest[]>
  public isGatekeeper$: Observable<boolean>
  public isKeyholder$: Observable<boolean>
  public balance$: Observable<BigNumber | undefined>
  public asset$: Observable<string>
  public activeContract$: Observable<Contract>
  public activeContractId$: Observable<string>

  constructor(
    private readonly store$: Store<fromRoot.State>,
    private readonly beaconService: BeaconService
  ) {
    this.store$.dispatch(actions.loadContracts())
    this.asset$ = this.store$.select((state) => state.app.asset)

    this.receivingAddressControl = new FormControl('', [
      Validators.required,
      Validators.minLength(36),
      Validators.maxLength(36),
      Validators.pattern('^tz1[\\d|a-zA-Z]{33}'),
    ])

    this.amountControl = new FormControl(null, [
      Validators.min(0),
      Validators.required,
      Validators.pattern('^[+-]?(\\d*\\.)?\\d+$'),
    ])

    this.beaconService.setupBeaconWallet()

    this.mintOperationRequests$ = this.store$.select(
      (state) => state.app.mintOperationRequests
    )
    this.burnOperationRequests$ = this.store$.select(
      (state) => state.app.burnOperationRequests
    )

    this.openMintOperationRequests$ = this.store$.select((state) =>
      state.app.mintOperationRequests.filter(
        (operationRequest) =>
          operationRequest.state === OperationRequestState.OPEN
      )
    )

    this.approvedMintOperationRequests$ = this.store$.select((state) =>
      state.app.mintOperationRequests.filter(
        (operationRequest) =>
          operationRequest.state === OperationRequestState.APPROVED
      )
    )

    this.openBurnRequests$ = this.store$.select((state) =>
      state.app.burnOperationRequests.filter(
        (operationRequest) =>
          operationRequest.state === OperationRequestState.OPEN
      )
    )

    this.approvedBurnRequests$ = this.store$.select((state) =>
      state.app.burnOperationRequests.filter(
        (operationRequest) =>
          operationRequest.state === OperationRequestState.APPROVED
      )
    )

    this.users$ = this.store$.select((state) => state.app.users)
    this.keyholders$ = this.store$.select((state) =>
      state.app.users.filter((user) => user.kind === UserKind.KEYHOLDER)
    )
    this.address$ = this.store$.select((state) => state.app.address)
    this.isGatekeeper$ = this.address$.pipe(
      switchMap((address) => {
        return this.store$.select((state) =>
          state.app.users.some(
            (user) =>
              user.kind === UserKind.GATEKEEPER && user.address === address
          )
        )
      })
    )
    this.isKeyholder$ = this.address$.pipe(
      switchMap((address) => {
        return this.store$.select((state) =>
          state.app.users.some(
            (user) =>
              user.kind === UserKind.KEYHOLDER && user.address === address
          )
        )
      })
    )

    this.balance$ = this.store$.select((state) => state.app.balance)

    this.amountTransferControl = new FormControl(null, [
      Validators.min(0),
      Validators.required,
      Validators.pattern('^[+-]?(\\d*\\.)?\\d+$'),
    ])

    this.activeContract$ = this.store$
      .select((state) => state.app.activeContract)
      .pipe(
        filter((value) => value !== undefined),
        map((value) => value!)
      )
    this.activeContractId$ = this.store$
      .select((state) => state.app.activeContract?.id)
      .pipe(
        filter((value) => value !== undefined),
        map((value) => value!)
      )
  }

  ngOnInit(): void {
    this.balance$.subscribe((balance) => {
      this.amountTransferControl.setValidators([
        Validators.min(0),
        Validators.max(balance?.toNumber() ?? 0),
        Validators.required,
        Validators.pattern('^[+-]?(\\d*\\.)?\\d+$'),
      ])
    })

    this.store$.dispatch(actions.loadContracts())
    this.activeContractId$.subscribe((contractId) => {
      if (contractId) {
        this.store$.dispatch(actions.loadUsers({ contractId: contractId }))
        this.store$.dispatch(
          actions.loadMintOperationRequests({
            contractId: contractId,
          })
        )
        this.store$.dispatch(
          actions.loadBurnOperationRequests({
            contractId: contractId,
          })
        )
      }
    })

    this.store$.dispatch(actions.loadBalance())
  }

  connectWallet() {
    this.store$.dispatch(actions.connectWallet())
  }

  mint() {
    this.getSignableOperationRequest(OperationRequestKind.MINT)
  }

  burn() {
    this.getSignableOperationRequest(OperationRequestKind.BURN)
  }

  private getSignableOperationRequest(kind: OperationRequestKind) {
    let targetAddress: string | undefined = undefined
    if (kind === OperationRequestKind.MINT) {
      if (
        this.receivingAddressControl.value &&
        this.receivingAddressControl.value.length === 36 &&
        this.receivingAddressControl.value.startsWith('tz1')
      ) {
        targetAddress = this.receivingAddressControl.value
      } else {
        throw new Error(
          `Address invalid: ${this.receivingAddressControl.value}`
        )
      }
    }

    const amountCondition =
      this.amountControl.value && Number(this.amountControl.value)
    if (!amountCondition) {
      throw new Error(`Amount invalid: ${this.amountControl.value}`)
    }

    this.activeContractId$.pipe(take(1)).subscribe((contractId) => {
      if (contractId) {
        this.store$.dispatch(
          actions.getSignableOperationRequest({
            contractId,
            kind,
            amount: new BigNumber(this.amountControl.value)
              .shiftedBy(8)
              .toFixed(),
            targetAddress,
          })
        )
      }
    })
  }

  transfer() {
    const receivingAddressCondition =
      this.receivingAddressControl.value &&
      this.receivingAddressControl.value.length === 36 &&
      this.receivingAddressControl.value.startsWith('tz1')

    if (this.amountTransferControl.value && receivingAddressCondition) {
      this.store$.dispatch(
        actions.transferOperation({
          transferAmount: Number(this.amountTransferControl.value),
          receivingAddress: this.receivingAddressControl.value,
        })
      )
    } else {
      console.log('invalid inputs')
    }
  }

  onSelect(event: any): void {
    this.selectedTab = event.id
  }

  setMaxValue(): void {
    this.balance$.subscribe((balance) => {
      this.amountTransferControl.setValue(balance)
    })
  }
}
