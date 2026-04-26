import matplotlib.dates as mdates
from matplotlib.colors import ListedColormap, BoundaryNorm
import xarray as xr
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
import matplotlib.dates as mdates
from scipy.interpolate import interp1d
import matplotlib.gridspec as gridspec

def find_ClosestTime(target_time, time_arr):
    # 您指定的目标时间（也要是 datetime64[ns] 类型）

    # 计算每个时间与目标时间的差的绝对值
    diffs = np.abs(time_arr - target_time)

    # 找到最小差值的索引
    closest_index = np.argmin(diffs)

    # 找到最接近的时间
    closest_time = time_arr[closest_index]
    return closest_index

filepath = r'D:\Yujie\WRJ_record\Airborne_Observe\20250926\data\PMWR_20250926+.nc'
data = xr.open_dataset(filepath)

height_unit = data.height.values
altitude = data.altitude.values
time_arr = data.time.values
time_count = np.arange(0, len(time_arr))
temp = data.profile_Temperature.values
RH = data.profile_RelativeHumidity.values
WVD = data.profile_WaterVaporDensity.values
LW = data.profile_LiquidWater.values
Lqint = data.Lqint.values
height_unit = np.arange(0, 10+0.001, 0.025)

height = data.height.values
altitude = data.altitude.values
AGL = (altitude - 19) / 1000
temp_adjust = np.zeros([time_arr.shape[0], height_unit.shape[0]])
RH_adjust = np.zeros([time_arr.shape[0], height_unit.shape[0]])
LW_adjust = np.zeros([time_arr.shape[0], height_unit.shape[0]])
WVD_adjust = np.zeros([time_arr.shape[0], height_unit.shape[0]])

for i, h in enumerate(AGL):
    ih = np.argmin(np.abs(height_unit - h))
    if ih < 0:
        ih = 0
    if ih > len(height_unit)*0.8:
        ih = np.argmin(np.abs(height_unit - AGL[i-1]))
    # print(AGL[i], height_unit[ih], ih)
    filled = np.ones([ih])*np.nan
    # 构建插值函数（线性插值）
    temp_interp_func = interp1d(height, temp[i,:], kind='linear')
    RH_interp_func = interp1d(height, RH[i,:], kind='linear')
    WVD_interp_func = interp1d(height, WVD[i,:], kind='linear')
    LW_interp_func = interp1d(height, LW[i,:], kind='linear')
    # 插值
    temp_interped = temp_interp_func(height_unit)
    RH_interped = RH_interp_func(height_unit)
    LW_interped = LW_interp_func(height_unit)
    WVD_interped = WVD_interp_func(height_unit)
    temp_adjust[i,:] = np.concatenate([filled, temp_interped])[:len(height_unit)]
    WVD_adjust[i,:] = np.concatenate([filled, WVD_interped])[:len(height_unit)]
    LW_adjust[i,:] = np.concatenate([filled, LW_interped])[:len(height_unit)]
    RH_adjust[i,:] = np.concatenate([filled, RH_interped])[:len(height_unit)]

# target_timeP21 = np.datetime64('2025-05-15T15:49:00.000000000')
# target_timeP22 = np.datetime64('2025-05-15T17:39:00.000000000')
# timeindexP21 =  find_ClosestTime(target_timeP21, time_arr)
# timeindexP22 =  find_ClosestTime(target_timeP22, time_arr)
# print(timeindexP21, timeindexP22)

# time_cut = time_arr[timeindexP21:timeindexP22+1]
# timecut_count = np.arange(0, len(time_cut))
# temp_cut = temp_adjust[timeindexP21:timeindexP22+1,:]
# RH_cut = RH_adjust[timeindexP21:timeindexP22+1,:]
# WVD_cut = WVD_adjust[timeindexP21:timeindexP22+1,:]
# LW_cut = LW_adjust[timeindexP21:timeindexP22+1,:]
# Lqint_cut = Lqint[timeindexP21:timeindexP22+1]

# 初始化等温线高度数组
zero_deg_height = np.full(len(temp_adjust), np.nan)
minus5_deg_height = np.full(len(temp_adjust), np.nan)

for i in range(len(temp_adjust)):
    temp_column = temp_adjust[i]  # 第i时刻的温度剖面

    # 如果存在有效数据才能插值
    if np.any(~np.isnan(temp_column)):
        try:
            # 需要保证温度随高度变化是单调或至少没有大跳变
            f = interp1d(temp_column, height_unit, bounds_error=False)
            # 先进行1D平滑（如3点均值）
        
            f2 = interp1d(height_unit, temp_column, bounds_error=False)
            if np.nanmin(temp_column) <= 0 <= np.nanmax(temp_column):
                zero_deg_height[i] = f(0)

            if np.nanmin(temp_column) <= -5 <= np.nanmax(temp_column):
                minus5_deg_height[i] = f(-5)

        except ValueError:
            # 跳过不能插值的情况（如温度全为NaN或恒定）
            print(f"Interpolation failed for time index {i} with temperature data: {temp_column}")
            pass

#将高度转换为气压
def height_to_pressure(height):
    # 使用国际标准大气压公式转换
    return 1013.25 * (1 - 0.0065 * height / 288.15) ** 5.25588 #输出hPa
presssure_arr = height_to_pressure(height_unit)

# 确认云区
RH0 = 85
RH_match_cloudmask = np.zeros_like(RH_adjust)
RH_match_cloudmask[RH_adjust >= RH0] = 1  # 云区

# 云中液面饱和水汽压
a1 = 1.809567918
a2 = 7.266296315e-2
a3 = -2.99640337e-4
a4 = 1.160464233e-6
a5 = -4.60651397e-9
a6 = 2.315159066e-11
a7 = -1.103513358e-13
es = np.exp(a1 + a2*temp_adjust + a3*temp_adjust**2 + a4*temp_adjust**3 + a5*temp_adjust**4 + a6*temp_adjust**5 + a7*temp_adjust**6)
# 冰面饱和水汽压 如果t<0
ei = np.zeros_like(es)
ei_temp = es * ((np.exp(21.8745584*temp_adjust)/(temp_adjust+273.16-7.66)) / np.exp(17.2693882*temp_adjust/(temp_adjust+273.16-35.86)))
ei[temp_adjust < 0] = ei_temp[temp_adjust < 0]
# 云中水汽压
e = 0.622*RH_adjust/100*es/(0.611+0.622*RH_adjust/100*es/presssure_arr)

turn_mask = np.zeros_like(RH_adjust)
turn_mask[(RH_adjust >= RH0) & (es > ei) & (e > es)] = 1  # 水汽转变为过冷水、水汽凝华成冰相粒子
turn_mask[(RH_adjust >= RH0) & (e < es) & (e > ei)] = 2  # 贝吉龙过程，过冷水滴蒸发，水汽凝华成冰相粒子
turn_mask[(RH_adjust >= RH0) & (es > ei) & (e < ei)] = 3  # 冰粒子升华成水汽、过冷水蒸发为水汽
turn_mask[np.isnan(RH_adjust)] = -1

colors = ['grey', 'white', 'blue', 'green', 'red']  # 可根据需要调整
labels = ['Filled(no data)', 'no cloud', 'e-es>0\nes-ei>0', 'es-e>0\ne-ei>0', 'es-ei>0\nei-e>0']  # 对应含义

cmap = ListedColormap(colors)
norm = BoundaryNorm(boundaries=np.arange(-1.5, 4.5, 1), ncolors=5)

fig = plt.figure(num=1, figsize=(10,3), dpi=100)
ax = fig.add_subplot(111)
pcm1 = ax.pcolormesh(time_count, height_unit, turn_mask.T, cmap=cmap, norm=norm, shading='auto')

#温度0℃
#温度-5℃
ax.plot(np.arange(len(time_arr)), zero_deg_height, color='purple', linestyle='--', label='0°C level')
ax.plot(np.arange(len(time_arr)), minus5_deg_height, color='blue', linestyle=':', label='-5°C level')
ax.legend(loc='upper left')

ax.set_xlim(0, len(time_count))
ax.set_ylabel("Height(km)", fontsize=12)
ax.set_xlabel("Time(2025/5/04)", fontsize=12)
ax.set_ylim([0, 8])
time_plotcount = np.arange(0, len(time_count), 50)
ax.set_xticks(time_plotcount)
ax.set_xticklabels([pd.to_datetime(time_arr[count]).strftime('%H:%M') for count in time_plotcount], rotation=45)
cb = plt.colorbar(pcm1, ax=ax)
cb.ax.set_yticks([-1, 0, 1, 2, 3])
cb.ax.set_yticklabels(labels)