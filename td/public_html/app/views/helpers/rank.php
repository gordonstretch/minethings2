<?

class RankHelper extends AppHelper
{
	var $helpers = array('Html');

	function ImagePath($rank, $vehicleCount)
	{
		$vehicleCount = min(25, $vehicleCount);
		if ($vehicleCount > 5)
			$vehicleCount = intval(floor($vehicleCount/5)*5);
		return "rankings/R$rank"."C$vehicleCount.png";
	}
	
	function ImageLink($rank, $vehicleCount, $imageAtts = array())
	{
		$imageAtts['border'] = 0;
		$img = $this->Html->image($this->ImagePath($rank, $vehicleCount), $imageAtts);
		return $this->Html->link($img, '/ratings', array('escape' => false));
	}

}
?>