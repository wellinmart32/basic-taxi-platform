import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { BaseMapComponent } from './base-map.component';

describe('BaseMapComponent', () => {
  let component: BaseMapComponent;
  let fixture: ComponentFixture<BaseMapComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [BaseMapComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BaseMapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
