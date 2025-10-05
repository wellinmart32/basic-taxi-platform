import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { RequestTripComponent } from './request-trip.component';

describe('RequestTripComponent', () => {
  let component: RequestTripComponent;
  let fixture: ComponentFixture<RequestTripComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [RequestTripComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RequestTripComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
