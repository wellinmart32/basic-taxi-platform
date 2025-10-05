import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { TripStatusComponent } from './trip-status.component';

describe('TripStatusComponent', () => {
  let component: TripStatusComponent;
  let fixture: ComponentFixture<TripStatusComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [TripStatusComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TripStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
